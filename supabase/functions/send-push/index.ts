import { createClient } from "npm:@supabase/supabase-js@2";
import { JWT } from "npm:google-auth-library@9";

const supabaseUrl = Deno.env.get("PROJECT_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SERVICE_ROLE_KEY")!;

const firebaseProjectId = Deno.env.get("FIREBASE_PROJECT_ID")!;
const firebaseClientEmail = Deno.env.get("FIREBASE_CLIENT_EMAIL")!;
const firebasePrivateKey = Deno.env
  .get("FIREBASE_PRIVATE_KEY")!
  .replace(/\\n/g, "\n");

const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

async function getAccessToken() {
  const jwtClient = new JWT({
    email: firebaseClientEmail,
    key: firebasePrivateKey,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });

  const tokens = await jwtClient.authorize();
  return tokens.access_token;
}

Deno.serve(async (req) => {
  try {
    const { user_id, title, body, data } = await req.json();

    if (!user_id || !title || !body) {
      return new Response(
        JSON.stringify({ error: "Missing user_id, title, or body" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: tokenRows, error: tokenError } = await supabase
      .from("device_push_tokens")
      .select("token")
      .eq("user_id", user_id);

    if (tokenError) {
      return new Response(JSON.stringify({ error: tokenError.message }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      });
    }

    const tokens = (tokenRows ?? []).map((row) => row.token).filter(Boolean);

    if (tokens.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, sent: 0, reason: "No device tokens" }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    const accessToken = await getAccessToken();

    const results = await Promise.all(
      tokens.map(async (token) => {
        const response = await fetch(
          `https://fcm.googleapis.com/v1/projects/${firebaseProjectId}/messages:send`,
          {
            method: "POST",
            headers: {
              Authorization: `Bearer ${accessToken}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              message: {
                token,
                notification: {
                  title,
                  body,
                },
                data: Object.fromEntries(
                  Object.entries(data ?? {}).map(([k, v]) => [k, String(v)])
                ),
                android: {
                  priority: "high",
                },
              },
            }),
          }
        );

        const json = await response.json();
        return { ok: response.ok, json, token };
      })
    );

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});