SET session_replication_role = replica;

--
-- PostgreSQL database dump
--

-- \restrict 8M23fYmuerA5UWWvEwvg8jhs3Bg6LJbZ7I861crNFeebWHwtbV3kvBaX1JVguCV

-- Dumped from database version 17.6
-- Dumped by pg_dump version 17.6

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: audit_log_entries; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: custom_oauth_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: flow_state; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."flow_state" ("id", "user_id", "auth_code", "code_challenge_method", "code_challenge", "provider_type", "provider_access_token", "provider_refresh_token", "created_at", "updated_at", "authentication_method", "auth_code_issued_at", "invite_token", "referrer", "oauth_client_state_id", "linking_target_id", "email_optional") VALUES
	('0fa48573-2901-4605-87b9-5e861d95ad67', '4f6a16b0-8618-4be2-a0cc-a1025f2ff114', '065043b9-9a24-484a-a039-aa4eaaee92eb', 's256', 'V4VXGY8VeGuTfnMxPXMZj9ZzoM5rbIzN8rML8t7q4fg', 'email', '', '', '2026-04-18 11:33:56.397355+00', '2026-04-18 11:33:56.397355+00', 'email/signup', NULL, NULL, NULL, NULL, NULL, false),
	('53ed5ab5-e867-4fc8-9379-e41dad447af9', '4f6a16b0-8618-4be2-a0cc-a1025f2ff114', 'b792191d-2461-459e-aec9-5daf732d299a', 's256', '2or5hbNtRw5SWYCbySOGEKiT-i9bixB7N9YrBaVdoJg', 'email', '', '', '2026-04-18 14:16:37.573455+00', '2026-04-18 14:16:37.573455+00', 'email/signup', NULL, NULL, NULL, NULL, NULL, false),
	('3950af32-fa6d-46d2-9b8f-5a83012e3e5e', '29df0a88-1d42-469d-b8fa-6070d10fe4e2', '63d7a00d-1202-4108-b999-a88b6545f2c2', 's256', 'Xq7iMwuBfqSWdXsfiTol6lnWMgLgP0YmhHYGqx4OQpo', 'email', '', '', '2026-04-19 00:17:48.074624+00', '2026-04-19 00:19:05.380365+00', 'email/signup', '2026-04-19 00:19:05.380318+00', NULL, NULL, NULL, NULL, false);


--
-- Data for Name: users; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."users" ("instance_id", "id", "aud", "role", "email", "encrypted_password", "email_confirmed_at", "invited_at", "confirmation_token", "confirmation_sent_at", "recovery_token", "recovery_sent_at", "email_change_token_new", "email_change", "email_change_sent_at", "last_sign_in_at", "raw_app_meta_data", "raw_user_meta_data", "is_super_admin", "created_at", "updated_at", "phone", "phone_confirmed_at", "phone_change", "phone_change_token", "phone_change_sent_at", "email_change_token_current", "email_change_confirm_status", "banned_until", "reauthentication_token", "reauthentication_sent_at", "is_sso_user", "deleted_at", "is_anonymous") VALUES
	('00000000-0000-0000-0000-000000000000', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', 'authenticated', 'authenticated', 'sergiobrabbs@gmail.com', '$2a$10$/XmFT8hhvDquJrT9NHGCqOrG3.gRsx/5Xkdays49h5wPV7CfH1Qsa', '2026-04-29 00:03:38.799822+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-05-18 00:58:52.2362+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "e82082b8-cc46-4442-8ba4-3e61fae58f37", "role": "buyer", "email": "sergiobrabbs@gmail.com", "full_name": "Sergio Brabbs", "email_verified": true, "phone_verified": false}', NULL, '2026-04-29 00:03:38.713817+00', '2026-05-31 22:44:29.800561+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'authenticated', 'authenticated', 'admin@relay.local', '$2a$10$Hn0lScmkjxMyY1dUxlbpbubuM3TNQMi2f36tkS4xYlJxkMu9YRKLa', '2026-04-18 16:15:06.062807+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-05-28 01:44:46.727736+00', '{"provider": "email", "providers": ["email"]}', '{"email_verified": true}', NULL, '2026-04-18 16:15:06.039462+00', '2026-06-03 17:47:08.279047+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false),
	('00000000-0000-0000-0000-000000000000', 'e9f61fed-bfaa-4539-aea5-461252dbce3e', 'authenticated', 'authenticated', 'cameronrocco75@gmail.com', '$2a$10$fTo0W0FcZPCliGGzCzkXPOdEBeoQRo2IMz3Hw9DraoymABlZHunSO', '2026-04-24 02:34:14.525383+00', NULL, '', NULL, '', NULL, '', '', NULL, '2026-05-09 03:10:49.836426+00', '{"provider": "email", "providers": ["email"]}', '{"sub": "e9f61fed-bfaa-4539-aea5-461252dbce3e", "role": "buyer", "email": "cameronrocco75@gmail.com", "full_name": "Cameron Rocco", "email_verified": true, "phone_verified": false}', NULL, '2026-04-24 02:34:14.480339+00', '2026-05-09 18:34:10.562356+00', NULL, NULL, '', '', NULL, '', 0, NULL, '', NULL, false, NULL, false);


--
-- Data for Name: identities; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."identities" ("provider_id", "user_id", "identity_data", "provider", "last_sign_in_at", "created_at", "updated_at", "id") VALUES
	('ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '{"sub": "ec8e553e-f4cf-4c88-bd71-b303b55e08b2", "email": "admin@relay.local", "email_verified": false, "phone_verified": false}', 'email', '2026-04-18 16:15:06.059548+00', '2026-04-18 16:15:06.059609+00', '2026-04-18 16:15:06.059609+00', 'cc0787ce-2987-45c7-aad2-8a026503362b'),
	('e9f61fed-bfaa-4539-aea5-461252dbce3e', 'e9f61fed-bfaa-4539-aea5-461252dbce3e', '{"sub": "e9f61fed-bfaa-4539-aea5-461252dbce3e", "role": "buyer", "email": "cameronrocco75@gmail.com", "full_name": "Cameron Rocco", "email_verified": false, "phone_verified": false}', 'email', '2026-04-24 02:34:14.516564+00', '2026-04-24 02:34:14.517228+00', '2026-04-24 02:34:14.517228+00', '82b35a01-3cfc-48c4-aa87-f9abbee93f99'),
	('e82082b8-cc46-4442-8ba4-3e61fae58f37', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '{"sub": "e82082b8-cc46-4442-8ba4-3e61fae58f37", "role": "buyer", "email": "sergiobrabbs@gmail.com", "full_name": "Sergio Brabbs", "email_verified": false, "phone_verified": false}', 'email', '2026-04-29 00:03:38.791327+00', '2026-04-29 00:03:38.791377+00', '2026-04-29 00:03:38.791377+00', 'a6c8b802-b60b-4f6b-9137-067b327dd0bd');


--
-- Data for Name: instances; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_clients; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sessions; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."sessions" ("id", "user_id", "created_at", "updated_at", "factor_id", "aal", "not_after", "refreshed_at", "user_agent", "ip", "tag", "oauth_client_id", "refresh_token_hmac_key", "refresh_token_counter", "scopes") VALUES
	('af499825-ac94-49a6-8e07-c2a489916042', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-27 02:06:42.260746+00', '2026-06-03 17:47:08.288777+00', NULL, 'aal1', NULL, '2026-06-03 17:47:08.288665', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/148.0.0.0 Safari/537.36', '108.160.198.167', NULL, NULL, NULL, NULL, NULL),
	('cac165df-0a20-467c-b48f-971aa0de1b3b', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '2026-04-29 00:03:38.815806+00', '2026-05-02 21:16:06.588371+00', NULL, 'aal1', NULL, '2026-05-02 21:16:06.588253', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1', '67.173.153.183', NULL, NULL, NULL, NULL, NULL),
	('222181ed-f7ce-4fe0-9595-ac71ca9dbfe0', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '2026-05-02 21:19:00.977252+00', '2026-05-02 21:19:00.977252+00', NULL, 'aal1', NULL, NULL, 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1', '67.173.153.183', NULL, NULL, NULL, NULL, NULL),
	('962fd08b-2f84-4aff-bb8f-72b692dce7bb', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '2026-05-02 21:20:43.433552+00', '2026-05-03 17:44:02.223454+00', NULL, 'aal1', NULL, '2026-05-03 17:44:02.223322', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1', '67.173.153.183', NULL, NULL, NULL, NULL, NULL),
	('2825a833-fb85-4d57-be8f-062f7350ef70', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '2026-05-18 00:58:52.236302+00', '2026-05-31 22:44:29.812463+00', NULL, 'aal1', NULL, '2026-05-31 22:44:29.812334', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1', '172.59.184.56', NULL, NULL, NULL, NULL, NULL),
	('758394dc-4106-42d3-b5af-55a242cdce36', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '2026-05-03 17:44:27.733119+00', '2026-05-18 00:58:31.225379+00', NULL, 'aal1', NULL, '2026-05-18 00:58:31.225252', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.7.5 Mobile/15E148 Safari/604.1', '67.176.137.102', NULL, NULL, NULL, NULL, NULL),
	('436ac992-b09e-4c28-b441-54193577719e', 'e9f61fed-bfaa-4539-aea5-461252dbce3e', '2026-05-09 03:10:49.837508+00', '2026-05-09 18:34:10.576794+00', NULL, 'aal1', NULL, '2026-05-09 18:34:10.576685', 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/146.0.0.0 Safari/537.36', '68.40.104.227', NULL, NULL, NULL, NULL, NULL),
	('0ba80513-4a84-4cc0-b3a6-7bfe1ca2b2e7', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-28 01:44:46.729086+00', '2026-06-03 17:04:45.525688+00', NULL, 'aal1', NULL, '2026-06-03 17:04:45.525532', 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.5 Mobile/15E148 Safari/604.1', '146.75.128.212', NULL, NULL, NULL, NULL, NULL);


--
-- Data for Name: mfa_amr_claims; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."mfa_amr_claims" ("session_id", "created_at", "updated_at", "authentication_method", "id") VALUES
	('cac165df-0a20-467c-b48f-971aa0de1b3b', '2026-04-29 00:03:38.866783+00', '2026-04-29 00:03:38.866783+00', 'password', '88c1d1c3-aaae-4d54-b596-1e55a894e8a7'),
	('222181ed-f7ce-4fe0-9595-ac71ca9dbfe0', '2026-05-02 21:19:01.013208+00', '2026-05-02 21:19:01.013208+00', 'password', 'ac09fdcd-45e7-4837-acb4-2847f2957b49'),
	('962fd08b-2f84-4aff-bb8f-72b692dce7bb', '2026-05-02 21:20:43.454807+00', '2026-05-02 21:20:43.454807+00', 'password', 'ef14d7dc-9f73-48cd-851e-fa2c980e0617'),
	('758394dc-4106-42d3-b5af-55a242cdce36', '2026-05-03 17:44:27.774283+00', '2026-05-03 17:44:27.774283+00', 'password', 'bb20c28a-1922-4fa1-99f6-b2e84c920b02'),
	('436ac992-b09e-4c28-b441-54193577719e', '2026-05-09 03:10:49.874778+00', '2026-05-09 03:10:49.874778+00', 'password', '7aa95ff5-aeaa-4a76-af19-45f479a74e10'),
	('2825a833-fb85-4d57-be8f-062f7350ef70', '2026-05-18 00:58:52.252152+00', '2026-05-18 00:58:52.252152+00', 'password', 'd5867c0c-4d8b-41bb-b09b-a79a6f2a6344'),
	('af499825-ac94-49a6-8e07-c2a489916042', '2026-05-27 02:06:42.318916+00', '2026-05-27 02:06:42.318916+00', 'password', '6d22eb02-a71a-4976-a10a-9daca7c1e387'),
	('0ba80513-4a84-4cc0-b3a6-7bfe1ca2b2e7', '2026-05-28 01:44:46.790972+00', '2026-05-28 01:44:46.790972+00', 'password', 'ffed46eb-8027-406f-82c7-1b2e7bfb3b46');


--
-- Data for Name: mfa_factors; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: mfa_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_authorizations; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_client_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: oauth_consents; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: one_time_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: refresh_tokens; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--

INSERT INTO "auth"."refresh_tokens" ("instance_id", "id", "token", "user_id", "revoked", "created_at", "updated_at", "parent", "session_id") VALUES
	('00000000-0000-0000-0000-000000000000', 344, '5jyh6fc3p5pv', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', true, '2026-05-27 02:06:42.284498+00', '2026-05-27 04:51:48.368955+00', NULL, 'af499825-ac94-49a6-8e07-c2a489916042'),
	('00000000-0000-0000-0000-000000000000', 349, 'zzcypjq6utml', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', false, '2026-05-31 22:44:29.785118+00', '2026-05-31 22:44:29.785118+00', 'ndp6q57jnlrh', '2825a833-fb85-4d57-be8f-062f7350ef70'),
	('00000000-0000-0000-0000-000000000000', 134, '2lvy4rnrkomr', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-04-29 00:03:38.838618+00', '2026-05-02 21:16:06.560071+00', NULL, 'cac165df-0a20-467c-b48f-971aa0de1b3b'),
	('00000000-0000-0000-0000-000000000000', 345, '6vaansqnfw74', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', true, '2026-05-27 04:51:48.391032+00', '2026-05-30 02:56:30.537609+00', '5jyh6fc3p5pv', 'af499825-ac94-49a6-8e07-c2a489916042'),
	('00000000-0000-0000-0000-000000000000', 350, '5dfefxe7tc2d', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', true, '2026-06-01 21:20:42.378833+00', '2026-06-03 16:05:10.696512+00', 'rbbm5gghzbzs', 'af499825-ac94-49a6-8e07-c2a489916042'),
	('00000000-0000-0000-0000-000000000000', 151, 'cdun2rthmzfz', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', false, '2026-05-02 21:16:06.570622+00', '2026-05-02 21:16:06.570622+00', '2lvy4rnrkomr', 'cac165df-0a20-467c-b48f-971aa0de1b3b'),
	('00000000-0000-0000-0000-000000000000', 152, 'n53ks7pczrgp', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', false, '2026-05-02 21:19:01.005475+00', '2026-05-02 21:19:01.005475+00', NULL, '222181ed-f7ce-4fe0-9595-ac71ca9dbfe0'),
	('00000000-0000-0000-0000-000000000000', 153, '6jbzlror75qw', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-02 21:20:43.451004+00', '2026-05-03 17:44:02.176575+00', NULL, '962fd08b-2f84-4aff-bb8f-72b692dce7bb'),
	('00000000-0000-0000-0000-000000000000', 163, 'gbxgzucncyxl', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', false, '2026-05-03 17:44:02.196991+00', '2026-05-03 17:44:02.196991+00', '6jbzlror75qw', '962fd08b-2f84-4aff-bb8f-72b692dce7bb'),
	('00000000-0000-0000-0000-000000000000', 164, '2xqdnar5q73t', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-03 17:44:27.762131+00', '2026-05-03 19:13:41.416623+00', NULL, '758394dc-4106-42d3-b5af-55a242cdce36'),
	('00000000-0000-0000-0000-000000000000', 168, 'g36x7cde5owk', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-03 19:13:41.425818+00', '2026-05-12 00:40:35.662592+00', '2xqdnar5q73t', '758394dc-4106-42d3-b5af-55a242cdce36'),
	('00000000-0000-0000-0000-000000000000', 346, 'gh5jzcozgwjs', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', true, '2026-05-28 01:44:46.76169+00', '2026-06-03 17:04:45.506368+00', NULL, '0ba80513-4a84-4cc0-b3a6-7bfe1ca2b2e7'),
	('00000000-0000-0000-0000-000000000000', 351, 'mww5fylfvn4w', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', true, '2026-06-03 16:05:10.719632+00', '2026-06-03 17:47:08.25027+00', '5dfefxe7tc2d', 'af499825-ac94-49a6-8e07-c2a489916042'),
	('00000000-0000-0000-0000-000000000000', 228, 'z4q3reh7b4xq', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-12 03:01:54.522651+00', '2026-05-18 00:58:31.191512+00', 'kepp2iyjy36g', '758394dc-4106-42d3-b5af-55a242cdce36'),
	('00000000-0000-0000-0000-000000000000', 216, 'pd2ln4zz7wwe', 'e9f61fed-bfaa-4539-aea5-461252dbce3e', true, '2026-05-09 03:10:49.863627+00', '2026-05-09 18:34:10.526707+00', NULL, '436ac992-b09e-4c28-b441-54193577719e'),
	('00000000-0000-0000-0000-000000000000', 218, 'tflrvjssekfv', 'e9f61fed-bfaa-4539-aea5-461252dbce3e', false, '2026-05-09 18:34:10.547215+00', '2026-05-09 18:34:10.547215+00', 'pd2ln4zz7wwe', '436ac992-b09e-4c28-b441-54193577719e'),
	('00000000-0000-0000-0000-000000000000', 226, 'h4f3d3pfnicu', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-12 00:40:35.669942+00', '2026-05-12 01:50:43.840999+00', 'g36x7cde5owk', '758394dc-4106-42d3-b5af-55a242cdce36'),
	('00000000-0000-0000-0000-000000000000', 227, 'kepp2iyjy36g', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-12 01:50:43.850747+00', '2026-05-12 03:01:54.514119+00', 'h4f3d3pfnicu', '758394dc-4106-42d3-b5af-55a242cdce36'),
	('00000000-0000-0000-0000-000000000000', 347, 'rbbm5gghzbzs', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', true, '2026-05-30 02:56:30.550474+00', '2026-06-01 21:20:42.356866+00', '6vaansqnfw74', 'af499825-ac94-49a6-8e07-c2a489916042'),
	('00000000-0000-0000-0000-000000000000', 352, '7cmc472zwmde', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', false, '2026-06-03 17:04:45.512009+00', '2026-06-03 17:04:45.512009+00', 'gh5jzcozgwjs', '0ba80513-4a84-4cc0-b3a6-7bfe1ca2b2e7'),
	('00000000-0000-0000-0000-000000000000', 341, '63qfrixllva5', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-25 04:06:02.97248+00', '2026-05-30 23:51:04.868717+00', 'iu7txhlsrtdt', '2825a833-fb85-4d57-be8f-062f7350ef70'),
	('00000000-0000-0000-0000-000000000000', 305, 'jpoumkf6qjzn', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', false, '2026-05-18 00:58:31.206953+00', '2026-05-18 00:58:31.206953+00', 'z4q3reh7b4xq', '758394dc-4106-42d3-b5af-55a242cdce36'),
	('00000000-0000-0000-0000-000000000000', 306, 'p2vcd2onta2e', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-18 00:58:52.247644+00', '2026-05-18 02:36:13.055791+00', NULL, '2825a833-fb85-4d57-be8f-062f7350ef70'),
	('00000000-0000-0000-0000-000000000000', 348, 'ndp6q57jnlrh', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-30 23:51:04.894405+00', '2026-05-31 22:44:29.762604+00', '63qfrixllva5', '2825a833-fb85-4d57-be8f-062f7350ef70'),
	('00000000-0000-0000-0000-000000000000', 353, 'gf7tk7y6czuq', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', false, '2026-06-03 17:47:08.264531+00', '2026-06-03 17:47:08.264531+00', 'mww5fylfvn4w', 'af499825-ac94-49a6-8e07-c2a489916042'),
	('00000000-0000-0000-0000-000000000000', 307, '4a2r6bkidx3l', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-18 02:36:13.076089+00', '2026-05-19 07:09:50.718053+00', 'p2vcd2onta2e', '2825a833-fb85-4d57-be8f-062f7350ef70'),
	('00000000-0000-0000-0000-000000000000', 314, 'owptc24ywt3b', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-19 07:09:50.73828+00', '2026-05-24 20:38:51.351846+00', '4a2r6bkidx3l', '2825a833-fb85-4d57-be8f-062f7350ef70'),
	('00000000-0000-0000-0000-000000000000', 339, 'iu7txhlsrtdt', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', true, '2026-05-24 20:38:51.372362+00', '2026-05-25 04:06:02.948024+00', 'owptc24ywt3b', '2825a833-fb85-4d57-be8f-062f7350ef70');


--
-- Data for Name: sso_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_providers; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: saml_relay_states; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: sso_domains; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_challenges; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: webauthn_credentials; Type: TABLE DATA; Schema: auth; Owner: supabase_auth_admin
--



--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."profiles" ("id", "email", "full_name", "username", "avatar_url", "role", "is_verified_seller", "seller_application_status", "stripe_account_id", "ship_from_address", "profile_banner_url", "display_name", "shop_name", "profile_theme", "bio", "created_at", "updated_at", "is_banned", "ban_reason", "dispute_flags_count", "followers_count", "sales_count", "avg_rating", "instagram_url") VALUES
	('e82082b8-cc46-4442-8ba4-3e61fae58f37', 'sergiobrabbs@gmail.com', 'Sergio Brabbs', 'user_81tbblc', NULL, 'seller', true, 'approved', 'acct_1TT44yQoTmsk8bUl', '{"zip": "46327", "city": "Hammond", "name": "Sergio Brabbs", "state": "Indiana", "street": "4215 Torrence Avenue", "country": "United States", "street2": ""}', NULL, 'Sergio Brabbs', NULL, 'default', NULL, '2026-04-29 00:03:38.712763+00', '2026-05-12 18:57:54.133318+00', false, NULL, 0, 1, 0, 0.00, '@NWISOLES'),
	('e9f61fed-bfaa-4539-aea5-461252dbce3e', 'cameronrocco75@gmail.com', 'Cameron Rocco', 'user_lw0ry6e', NULL, 'buyer', false, 'none', NULL, NULL, NULL, NULL, NULL, 'default', NULL, '2026-04-24 02:34:14.480005+00', '2026-04-24 02:34:14.480005+00', false, NULL, 0, 0, 0, 0.00, NULL),
	('ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'admin@relay.local', 'Admin User', 'admin_relay', 'https://toesuaqlcqsluyfnkrpt.supabase.co/storage/v1/object/public/profile-images/ec8e553e-f4cf-4c88-bd71-b303b55e08b2/avatar-1777778165185.jpg', 'admin', false, 'none', NULL, '{"zip": "", "city": "", "state": "", "street": "", "country": "", "street2": ""}', 'https://toesuaqlcqsluyfnkrpt.supabase.co/storage/v1/object/public/profile-images/ec8e553e-f4cf-4c88-bd71-b303b55e08b2/banner-1777778588271.jpg', 'Javi Aviles', '', 'default', 'Marketplace administrator', '2026-04-18 16:16:59.451096+00', '2026-05-03 18:00:33.47956+00', false, NULL, 0, 1, 0, 0.00, NULL);


--
-- Data for Name: listings; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: conversations; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."conversations" ("id", "participant_ids", "listing_id", "last_message", "last_message_at", "created_at") VALUES
	('1f6cef69-40c0-40c3-b19f-b05f82c258ec', '{ec8e553e-f4cf-4c88-bd71-b303b55e08b2,e82082b8-cc46-4442-8ba4-3e61fae58f37}', NULL, 'The way to know your listing is active is just to make sure it says "Active" in your My Listings tab', '2026-05-12 16:58:31.98+00', '2026-05-03 18:18:08.792243+00');


--
-- Data for Name: conversation_reads; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."conversation_reads" ("user_id", "conversation_id", "last_read_at") VALUES
	('e82082b8-cc46-4442-8ba4-3e61fae58f37', '1f6cef69-40c0-40c3-b19f-b05f82c258ec', '2026-05-24 20:39:06.281+00'),
	('ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '1f6cef69-40c0-40c3-b19f-b05f82c258ec', '2026-06-01 21:21:01.111+00');


--
-- Data for Name: custom_offers; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: follows; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."follows" ("id", "follower_id", "following_id", "created_at") VALUES
	('8b703488-d547-4c9d-8552-73b96e7a9b50', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-03 18:00:33.47956+00'),
	('d3e956dd-a2cf-4281-8802-0af299319bd7', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '2026-05-12 18:57:54.133318+00');


--
-- Data for Name: messages; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."messages" ("id", "conversation_id", "sender_id", "content", "message_type", "custom_offer_price", "custom_offer_status", "custom_offer_size", "created_at") VALUES
	('c2ca074c-8ec2-45ae-9216-cc6058e8f40e', '1f6cef69-40c0-40c3-b19f-b05f82c258ec', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'Hi Sergio, It''s Javi. Now that you are all set up as a seller in the platform, if you have any issues you can reach me here. It''s faster than email, and I will check my messages regularly. While you are waiting for the marketplace to open, feel free to customize your profile and make posts. Those posts will populate the feed tab for everyone joining Relay. Let me know if you need any help getting your initial inventory listed, and thanks for your trust and willingness to give Relay a shot.', 'text', NULL, NULL, NULL, '2026-05-03 18:21:49.143261+00'),
	('f4a2ce1f-1e4b-42b1-9550-3e91f7c6b425', '1f6cef69-40c0-40c3-b19f-b05f82c258ec', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', 'Is the marketplace available yet for now it still shows opening soon', 'text', NULL, NULL, NULL, '2026-05-12 00:42:21.248796+00'),
	('848b5068-280a-4849-97a3-2d2c0e776872', '1f6cef69-40c0-40c3-b19f-b05f82c258ec', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'The marketplace will open once there are enough listings in there. Sellers can still list shoes while the marketplace is closed, you just won''t be able to see them in the marketplace tab until I open it. The reason I am doing it that way is so that when the first buyers sign up for Relay they aren''t met with an empty marketplace.', 'text', NULL, NULL, NULL, '2026-05-12 16:58:07.945895+00'),
	('92e11e6a-ce0a-4369-a74e-c662258fc251', '1f6cef69-40c0-40c3-b19f-b05f82c258ec', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'The way to know your listing is active is just to make sure it says "Active" in your My Listings tab', 'text', NULL, NULL, NULL, '2026-05-12 16:58:32.796125+00');


--
-- Data for Name: orders; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: posts; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."posts" ("id", "seller_id", "content", "images", "likes_count", "is_rising_brand", "created_at", "related_listing_id", "is_custom_brand") VALUES
	('e2610ea5-0654-4e39-8a9b-6d599133abd0', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', 'Welcome to Relay!
A marketplace built for sellers who actually want to build something - not just list products.
Real-time chat, a discovery feed, and ultra-low fees put control back in your hands.', '{https://toesuaqlcqsluyfnkrpt.supabase.co/storage/v1/object/public/profile-images/ec8e553e-f4cf-4c88-bd71-b303b55e08b2/post-1777778942902-0.jpg,https://toesuaqlcqsluyfnkrpt.supabase.co/storage/v1/object/public/profile-images/ec8e553e-f4cf-4c88-bd71-b303b55e08b2/post-1777778943909-1.jpg}', 1, false, '2026-05-03 03:29:02.986161+00', NULL, false);


--
-- Data for Name: post_likes; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."post_likes" ("id", "post_id", "user_id", "created_at") VALUES
	('4c21debc-f32f-4937-a7d3-05fa17e32c47', 'e2610ea5-0654-4e39-8a9b-6d599133abd0', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-11 22:43:14.316373+00');


--
-- Data for Name: reviews; Type: TABLE DATA; Schema: public; Owner: postgres
--



--
-- Data for Name: seller_applications; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."seller_applications" ("id", "user_id", "ship_from_address", "questionnaire_responses", "stripe_connected", "terms_accepted", "status", "admin_notes", "ai_recommendation", "rejection_count", "created_at", "updated_at") VALUES
	('7ccfd6a6-3aff-4a05-9843-bc9dfc105a5b', 'e82082b8-cc46-4442-8ba4-3e61fae58f37', '{"zip": "46327", "city": "Hammond", "name": "Sergio Brabbs", "state": "Indiana", "street": "4215 Torrence Avenue", "country": "United States", "street2": ""}', '{"own_brand": "", "why_relay": "Reach new clientele ", "other_links": "", "instagram_url": "@NWISOLES", "monthly_volume": "100", "primary_shoe_type": "authenticated_sneakers", "previous_platforms": "Goat", "reselling_duration": "6 years", "authenticity_verification": "Check check ,personal experience "}', true, true, 'approved', 'First client. Application actually looks pretty good even though it''s short answers.', '{"decision":"review","confidence":64,"analysis":"**Needs Further Review** — This applicant scored 64% on the automated review. The application has some positive signals but also raises concerns that warrant manual review. Primary concerns: authentication process could be more detailed or robust; motivation for joining relay is vague.","strengths":["Focuses on authenticated sneakers, aligning with Relay''s core market","Experienced seller with 6+ years of reselling history","Has sold on goat","High-volume seller expecting 100+ listings/month","Stripe account connected and verified","Complete shipping address provided"],"concerns":["Authentication process could be more detailed or robust","Motivation for joining Relay is vague"]}', 0, '2026-05-03 18:00:07.920377+00', '2026-05-03 18:17:58.291862+00');


--
-- Data for Name: site_settings; Type: TABLE DATA; Schema: public; Owner: postgres
--

INSERT INTO "public"."site_settings" ("id", "onboarding_active", "updated_at") VALUES
	('2c638e63-23cd-4206-b00d-e210b13501b8', true, '2026-04-26 01:35:57.364+00');


--
-- Data for Name: buckets; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."buckets" ("id", "name", "owner", "created_at", "updated_at", "public", "avif_autodetection", "file_size_limit", "allowed_mime_types", "owner_id", "type") VALUES
	('profile-images', 'profile-images', NULL, '2026-04-19 22:25:49.189337+00', '2026-04-19 22:25:49.189337+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('listing-images', 'listing-images', NULL, '2026-04-19 22:25:57.286724+00', '2026-04-19 22:25:57.286724+00', true, false, NULL, NULL, NULL, 'STANDARD'),
	('order-photos', 'order-photos', NULL, '2026-04-20 20:53:07.635434+00', '2026-04-20 20:53:07.635434+00', true, false, NULL, NULL, NULL, 'STANDARD');


--
-- Data for Name: buckets_analytics; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: buckets_vectors; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: objects; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--

INSERT INTO "storage"."objects" ("id", "bucket_id", "name", "owner", "created_at", "updated_at", "last_accessed_at", "metadata", "version", "owner_id", "user_metadata") VALUES
	('e8a76c99-e2c0-438e-b5f6-23de6e5e6cd9', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/back.jpg', NULL, '2026-04-21 04:19:27.973983+00', '2026-04-21 04:19:27.973983+00', '2026-04-21 04:19:27.973983+00', '{"eTag": "\"96a3498a65d23e8c3d7e92ac346a3eef\"", "size": 471731, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:28.000Z", "contentLength": 471731, "httpStatusCode": 200}', '73672dfd-f730-4e43-bffb-9ee54c4773d0', NULL, '{}'),
	('29774a47-6366-4e56-9f79-f8387c09b0fc', 'profile-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/banner-1776637667158.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-19 22:27:47.554152+00', '2026-04-19 22:27:47.554152+00', '2026-04-19 22:27:47.554152+00', '{"eTag": "\"45bd87a2c50c4140123371e283af3124\"", "size": 18786, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-19T22:27:48.000Z", "contentLength": 18786, "httpStatusCode": 200}', '7f3e7701-3ba8-43cc-86e9-e5c287b9748f', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('d2379314-50b2-48eb-aa17-30f050c99e53', 'profile-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/avatar-1776637768785.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-19 22:29:29.344028+00', '2026-04-19 22:29:29.344028+00', '2026-04-19 22:29:29.344028+00', '{"eTag": "\"70fa35e3803b232ec1fce39b61330121\"", "size": 1475591, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-19T22:29:30.000Z", "contentLength": 1475591, "httpStatusCode": 200}', '14f9cc0e-15b3-42f9-b70d-836e210b1ff8', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('20ca2641-424a-4892-a0ac-057f030a820f', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/medial.jpg', NULL, '2026-04-21 04:19:28.548181+00', '2026-04-21 04:19:28.548181+00', '2026-04-21 04:19:28.548181+00', '{"eTag": "\"43863748b72e4eb80562bc7485e1cb23\"", "size": 507976, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:29.000Z", "contentLength": 507976, "httpStatusCode": 200}', 'ede2856d-c194-42f0-89d9-35ff8339ca3e', NULL, '{}'),
	('fdd4a724-fdbe-4ed5-9b83-629149060970', 'listing-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/1776638054676-0.8742090107118186.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-19 22:34:14.975619+00', '2026-04-19 22:34:14.975619+00', '2026-04-19 22:34:14.975619+00', '{"eTag": "\"c2bb297a36cad850f27ce4997a97aa20\"", "size": 129482, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-19T22:34:15.000Z", "contentLength": 129482, "httpStatusCode": 200}', '91d04c83-f98e-468b-8d92-c0ca852f108b', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('018aafe0-e289-43ea-9fa4-6663d55150d8', 'listing-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/1776638055161-0.9030827202449132.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-19 22:34:15.250558+00', '2026-04-19 22:34:15.250558+00', '2026-04-19 22:34:15.250558+00', '{"eTag": "\"0483172dec153b168db829f16617bc9d\"", "size": 34942, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-19T22:34:16.000Z", "contentLength": 34942, "httpStatusCode": 200}', 'a3ebed4a-f2db-4335-b85a-705b635a8160', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('3d91814e-2eb7-4920-9abd-78c30abd3422', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/lateral.jpg', NULL, '2026-04-21 04:19:29.422218+00', '2026-04-21 04:19:29.422218+00', '2026-04-21 04:19:29.422218+00', '{"eTag": "\"b96e34585e85b2480f1a05a3bc54bdd9\"", "size": 479566, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:30.000Z", "contentLength": 479566, "httpStatusCode": 200}', 'b0cc45f3-7147-4810-b2aa-dc5deecd9fe6', NULL, '{}'),
	('005f2861-0684-47c7-94e3-77ac5d732587', 'listing-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/1776638055437-0.8142465692108765.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-19 22:34:15.477088+00', '2026-04-19 22:34:15.477088+00', '2026-04-19 22:34:15.477088+00', '{"eTag": "\"c1be259821d7ad71fde6bbbb774d3ae3\"", "size": 23996, "mimetype": "image/avif", "cacheControl": "max-age=3600", "lastModified": "2026-04-19T22:34:16.000Z", "contentLength": 23996, "httpStatusCode": 200}', 'e78b4773-5e53-4fbd-815c-f74be3ea4e86', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('cc9c9221-f5e1-420e-a0d7-0c0ae811a819', 'listing-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/1776651993074-0.8529179736105736.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-20 02:26:33.286342+00', '2026-04-20 02:26:33.286342+00', '2026-04-20 02:26:33.286342+00', '{"eTag": "\"0483172dec153b168db829f16617bc9d\"", "size": 34942, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T02:26:34.000Z", "contentLength": 34942, "httpStatusCode": 200}', '8277fca3-80cf-4839-8d2b-e53d17efa86e', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('5ad0a72c-c7ac-4149-8bc6-24bc612c1230', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/sole.jpg', NULL, '2026-04-21 04:19:30.191185+00', '2026-04-21 04:19:30.191185+00', '2026-04-21 04:19:30.191185+00', '{"eTag": "\"40afb8cd02feee1eb062ee714e4acf99\"", "size": 482298, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:31.000Z", "contentLength": 482298, "httpStatusCode": 200}', 'ed9e914b-ab65-4bd7-9992-49646d222fdb', NULL, '{}'),
	('e46399bb-8027-44ee-bd22-04afe703e131', 'listing-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/1776651993584-0.21457998324604088.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-20 02:26:33.871975+00', '2026-04-20 02:26:33.871975+00', '2026-04-20 02:26:33.871975+00', '{"eTag": "\"c2bb297a36cad850f27ce4997a97aa20\"", "size": 129482, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T02:26:34.000Z", "contentLength": 129482, "httpStatusCode": 200}', '84054327-3c75-4624-8a70-0c3fbe3a9d2e', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('a6c30050-508a-4dba-a97b-96f8a284ee9f', 'listing-images', '8af5006a-0891-42e7-a5ba-a6d1c920333c/1776651994177-0.5360932684457622.jpg', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '2026-04-20 02:26:34.110239+00', '2026-04-20 02:26:34.110239+00', '2026-04-20 02:26:34.110239+00', '{"eTag": "\"c1be259821d7ad71fde6bbbb774d3ae3\"", "size": 23996, "mimetype": "image/avif", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T02:26:35.000Z", "contentLength": 23996, "httpStatusCode": 200}', 'aebfc265-0933-464c-a162-d6fd3c127781', '8af5006a-0891-42e7-a5ba-a6d1c920333c', '{}'),
	('a4acca21-a457-4279-bd8f-a33465f93c3a', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/size-tag.jpg', NULL, '2026-04-21 04:19:30.797451+00', '2026-04-21 04:19:30.797451+00', '2026-04-21 04:19:30.797451+00', '{"eTag": "\"9b5533020ca964300751fb6cc421fd6a\"", "size": 412618, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:31.000Z", "contentLength": 412618, "httpStatusCode": 200}', 'f0fa7fed-8907-4868-972a-5a1559f1449c', NULL, '{}'),
	('0e83ad0b-0eb3-4c93-9934-6e9686afcda5', 'listing-images', '04d7fa56-c016-4711-8cf6-f3c202037666/1776713102666-0.6732009545389941.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-20 19:25:02.764029+00', '2026-04-20 19:25:02.764029+00', '2026-04-20 19:25:02.764029+00', '{"eTag": "\"0483172dec153b168db829f16617bc9d\"", "size": 34942, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T19:25:03.000Z", "contentLength": 34942, "httpStatusCode": 200}', 'f95721b3-43c3-4b6f-be3e-a10bbd18171a', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('2fbac4f7-a04a-4d39-b0f8-831a0b5faa1d', 'listing-images', '04d7fa56-c016-4711-8cf6-f3c202037666/1776713103057-0.860742928067571.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-20 19:25:03.017776+00', '2026-04-20 19:25:03.017776+00', '2026-04-20 19:25:03.017776+00', '{"eTag": "\"c1be259821d7ad71fde6bbbb774d3ae3\"", "size": 23996, "mimetype": "image/avif", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T19:25:03.000Z", "contentLength": 23996, "httpStatusCode": 200}', 'd09f01ec-c8ed-43b9-8b11-ae779c57cf23', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('513e3b5d-2618-481c-8a33-87538dd3b201', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/challenge-code.jpg', NULL, '2026-04-21 04:19:31.456978+00', '2026-04-21 04:19:31.456978+00', '2026-04-21 04:19:31.456978+00', '{"eTag": "\"09790b0a1d80c79f3ab98dec3b7ee27d\"", "size": 525437, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:32.000Z", "contentLength": 525437, "httpStatusCode": 200}', '3b76b37f-4e94-496c-bb42-6e0e685dbb51', NULL, '{}'),
	('ac414996-6171-4bf2-83fb-99efb1ae1631', 'listing-images', '04d7fa56-c016-4711-8cf6-f3c202037666/1776713103316-0.13277657234736506.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-20 19:25:03.533544+00', '2026-04-20 19:25:03.533544+00', '2026-04-20 19:25:03.533544+00', '{"eTag": "\"c2bb297a36cad850f27ce4997a97aa20\"", "size": 129482, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T19:25:04.000Z", "contentLength": 129482, "httpStatusCode": 200}', 'eaf3a602-88c9-4ca7-a704-014bad813d32', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('15c91bca-4fa9-4908-b0a0-8430601b1007', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/checkcheck-certificate.pdf', NULL, '2026-04-20 20:53:23.568253+00', '2026-04-20 20:53:23.568253+00', '2026-04-20 20:53:23.568253+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:24.000Z", "contentLength": 186219, "httpStatusCode": 200}', '08da70ac-d2b8-4270-9312-24b84730518b', NULL, '{}'),
	('57395f76-04c1-4be6-9cb0-13e621a66940', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/packed-shipment.jpg', NULL, '2026-04-21 04:19:32.841252+00', '2026-04-21 04:19:32.841252+00', '2026-04-21 04:19:32.841252+00', '{"eTag": "\"aef63a5940dbb5822f9332a1db92b8bc\"", "size": 557629, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:33.000Z", "contentLength": 557629, "httpStatusCode": 200}', 'a0186346-2ccc-4cb7-8703-8ce4c82951af', NULL, '{}'),
	('33a3fc6e-2b1f-4c76-aa15-d0ef7eb390da', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/front.jpg', NULL, '2026-04-20 20:53:27.974696+00', '2026-04-20 20:53:27.974696+00', '2026-04-20 20:53:27.974696+00', '{"eTag": "\"7d289e7582077d2cd8eb857c6b06d1df\"", "size": 635326, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:28.000Z", "contentLength": 635326, "httpStatusCode": 200}', 'e97072ff-4542-4985-97a7-810d7709d960', NULL, '{}'),
	('010b4c71-8a6d-4f20-b08d-8e43dc04313b', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/back.jpg', NULL, '2026-04-20 20:53:28.765466+00', '2026-04-20 20:53:28.765466+00', '2026-04-20 20:53:28.765466+00', '{"eTag": "\"9212c06026d96c4289f29d88dbffa989\"", "size": 573107, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:29.000Z", "contentLength": 573107, "httpStatusCode": 200}', '3de96f9c-4c3f-4566-b38f-94d8092921a2', NULL, '{}'),
	('6cf26d6f-1963-49fb-8129-a837364aeefb', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/size-tag.jpg', NULL, '2026-04-23 03:52:59.506305+00', '2026-04-23 03:52:59.506305+00', '2026-04-23 03:52:59.506305+00', '{"eTag": "\"40334be318e66f2e9b755d1f7a720b55\"", "size": 409613, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:53:00.000Z", "contentLength": 409613, "httpStatusCode": 200}', '073e4a95-eeb6-44d4-aa89-006fcb156e61', NULL, '{}'),
	('bae10408-1ddb-403c-89b0-28e07e8e0523', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/medial.jpg', NULL, '2026-04-20 20:53:29.549645+00', '2026-04-20 20:53:29.549645+00', '2026-04-20 20:53:29.549645+00', '{"eTag": "\"c3c55239a178803e5fbabec9505bd0ef\"", "size": 754063, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:30.000Z", "contentLength": 754063, "httpStatusCode": 200}', '02020ee6-89ed-43c7-80b2-a8251068ddcc', NULL, '{}'),
	('ce8bd579-668e-455f-8e58-f621f5472ad2', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/lateral.jpg', NULL, '2026-04-20 20:53:30.55653+00', '2026-04-20 20:53:30.55653+00', '2026-04-20 20:53:30.55653+00', '{"eTag": "\"a2525d1a2a01bb64aeb76db60ba47c66\"", "size": 472353, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:31.000Z", "contentLength": 472353, "httpStatusCode": 200}', 'a47aba9a-c02d-43cc-8335-99b037155bc4', NULL, '{}'),
	('6b85da09-88ec-4c4b-95a8-81b3b33800f3', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/sole.jpg', NULL, '2026-04-20 20:53:31.156908+00', '2026-04-20 20:53:31.156908+00', '2026-04-20 20:53:31.156908+00', '{"eTag": "\"6dfc66941bf95531b4a2459b53af36d2\"", "size": 466018, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:32.000Z", "contentLength": 466018, "httpStatusCode": 200}', '56cbeec7-c079-41e3-8d25-a148bd117ebf', NULL, '{}'),
	('ef2744de-72bc-47da-b489-b637c5a3ed43', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/size-tag.jpg', NULL, '2026-04-20 20:53:31.839632+00', '2026-04-20 20:53:31.839632+00', '2026-04-20 20:53:31.839632+00', '{"eTag": "\"87978682a8c888f3d4941706414f2d64\"", "size": 790025, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:32.000Z", "contentLength": 790025, "httpStatusCode": 200}', 'a3054581-1136-4b2d-a56a-27a56c7126a7', NULL, '{}'),
	('afdae182-adef-4bdc-ba16-1f47682a060e', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/challenge-code.jpg', NULL, '2026-04-20 20:53:32.775604+00', '2026-04-20 20:53:32.775604+00', '2026-04-20 20:53:32.775604+00', '{"eTag": "\"2be551b3e46eabe32dbbd06761d79f68\"", "size": 627206, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:33.000Z", "contentLength": 627206, "httpStatusCode": 200}', '0450874d-f6ed-443d-a14e-5a6eb34ae0dd', NULL, '{}'),
	('57d485d3-2826-4df2-9426-e98f43a70aa1', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/checkcheck-certificate.pdf', NULL, '2026-04-23 02:33:45.977303+00', '2026-04-23 02:33:45.977303+00', '2026-04-23 02:33:45.977303+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:46.000Z", "contentLength": 186219, "httpStatusCode": 200}', '3f7aeb3d-99f7-48ad-a31d-4810f7efd4de', NULL, '{}'),
	('d543297b-9097-4db8-a17a-693c688495b4', 'order-photos', 'b32874c2-52b1-4b10-8451-249cc8c4d1de/packed-shipment.jpg', NULL, '2026-04-20 20:53:33.446551+00', '2026-04-20 20:53:33.446551+00', '2026-04-20 20:53:33.446551+00', '{"eTag": "\"54b40acc3a4944ef370fe4ba024642b9\"", "size": 416895, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T20:53:34.000Z", "contentLength": 416895, "httpStatusCode": 200}', '162b3de2-8e3f-44cc-967f-dc2dbafd56f0', NULL, '{}'),
	('d2aad6f1-ae75-4573-bcf6-ac003b2c8e68', 'listing-images', '04d7fa56-c016-4711-8cf6-f3c202037666/1776719646445-0.5993424149273252.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-20 21:14:06.795602+00', '2026-04-20 21:14:06.795602+00', '2026-04-20 21:14:06.795602+00', '{"eTag": "\"b9fd6fe536e926375ac601388f3f58b3\"", "size": 119740, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:14:07.000Z", "contentLength": 119740, "httpStatusCode": 200}', '0c5586c7-1ca8-4560-9600-9dfb640b8ae1', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('f40353c1-dda5-4543-affb-e2ddef2ebc97', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/front.jpg', NULL, '2026-04-23 02:33:48.175535+00', '2026-04-23 02:33:48.175535+00', '2026-04-23 02:33:48.175535+00', '{"eTag": "\"ed50ab5dbb8d7c4d73a9c38f87f77422\"", "size": 503483, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:49.000Z", "contentLength": 503483, "httpStatusCode": 200}', '9bdbf39b-07f0-462b-bbd6-379f344e9fbd', NULL, '{}'),
	('173a01e7-dcbc-4d55-b2b9-e56468896cfe', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/checkcheck-certificate.pdf', NULL, '2026-04-20 21:16:57.139776+00', '2026-04-20 21:16:57.139776+00', '2026-04-20 21:16:57.139776+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:16:58.000Z", "contentLength": 186219, "httpStatusCode": 200}', 'c8e2ff8b-8baf-4197-a7d6-657ca77a709e', NULL, '{}'),
	('0a1428ac-67a7-44b8-9329-5570fc9bfd16', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/front.jpg', NULL, '2026-04-20 21:16:59.14755+00', '2026-04-20 21:16:59.14755+00', '2026-04-20 21:16:59.14755+00', '{"eTag": "\"5120912dd4a3bd702171481525445e3c\"", "size": 381561, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:00.000Z", "contentLength": 381561, "httpStatusCode": 200}', 'e9e698ba-f290-4d0a-a5e7-d0c40ffaee6a', NULL, '{}'),
	('e5d02ab6-d2a6-4912-b2fe-6a755f1c9586', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/back.jpg', NULL, '2026-04-23 02:33:48.892855+00', '2026-04-23 02:33:48.892855+00', '2026-04-23 02:33:48.892855+00', '{"eTag": "\"40d39d1c0ce45336e3055db5b45d1423\"", "size": 475343, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:49.000Z", "contentLength": 475343, "httpStatusCode": 200}', '077fc160-6380-494c-a928-3064433a9664', NULL, '{}'),
	('aea6bbe6-0467-45cc-ac35-ad33f7b82a42', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/back.jpg', NULL, '2026-04-20 21:16:59.97393+00', '2026-04-20 21:16:59.97393+00', '2026-04-20 21:16:59.97393+00', '{"eTag": "\"da6beadcc0c2bbef865a06d09a435e7c\"", "size": 555180, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:00.000Z", "contentLength": 555180, "httpStatusCode": 200}', '0e85e5cc-b7e1-4388-a88d-792859903cf2', NULL, '{}'),
	('cf47612a-f212-4d12-924f-0852b4f62f37', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/medial.jpg', NULL, '2026-04-20 21:17:00.762285+00', '2026-04-20 21:17:00.762285+00', '2026-04-20 21:17:00.762285+00', '{"eTag": "\"d3509eeaf7e1afdef1bb734c3a4b1bb1\"", "size": 817821, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:01.000Z", "contentLength": 817821, "httpStatusCode": 200}', 'd06679c1-92ff-4f24-bfa7-e56be9bd0d7e', NULL, '{}'),
	('88420125-2e39-4b4a-a40e-546598687807', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/lateral.jpg', NULL, '2026-04-20 21:17:01.703471+00', '2026-04-20 21:17:01.703471+00', '2026-04-20 21:17:01.703471+00', '{"eTag": "\"c51a6a3f656e8ae02336c4aaf31cbc56\"", "size": 560174, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:02.000Z", "contentLength": 560174, "httpStatusCode": 200}', 'b41f925d-eb2f-4aeb-8a8f-d17805004aca', NULL, '{}'),
	('4181e32f-7d43-4c84-b827-c545ba438180', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/sole.jpg', NULL, '2026-04-20 21:17:02.54486+00', '2026-04-20 21:17:02.54486+00', '2026-04-20 21:17:02.54486+00', '{"eTag": "\"a3f34565516e9ae5c6aae03ba798a692\"", "size": 558856, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:03.000Z", "contentLength": 558856, "httpStatusCode": 200}', '0ac2fe08-4309-4cab-aadc-8b977556ccc0', NULL, '{}'),
	('3bc0cc57-71ed-45ce-8301-9fbc1c6efae5', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/medial.jpg', NULL, '2026-04-23 02:33:49.594908+00', '2026-04-23 02:33:49.594908+00', '2026-04-23 02:33:49.594908+00', '{"eTag": "\"f41d488343416c103096e2dbbcf729c2\"", "size": 480207, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:50.000Z", "contentLength": 480207, "httpStatusCode": 200}', '48131154-b072-41a5-ac9b-8d195cef0430', NULL, '{}'),
	('57383dec-ab99-4d1e-8c7d-b9e3639d926f', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/size-tag.jpg', NULL, '2026-04-20 21:17:03.5012+00', '2026-04-20 21:17:03.5012+00', '2026-04-20 21:17:03.5012+00', '{"eTag": "\"057725992b84f8d1da0cc93f940a2751\"", "size": 830311, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:04.000Z", "contentLength": 830311, "httpStatusCode": 200}', 'c935f4bd-d966-46bd-9377-e3c7214af39f', NULL, '{}'),
	('fd2ef80b-d227-4425-a89d-1ac77633aaa6', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/challenge-code.jpg', NULL, '2026-04-20 21:17:04.32252+00', '2026-04-20 21:17:04.32252+00', '2026-04-20 21:17:04.32252+00', '{"eTag": "\"d5808b99727a058bc2d2308b0b1d8236\"", "size": 657493, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:05.000Z", "contentLength": 657493, "httpStatusCode": 200}', '3fe9b439-423e-4b94-81ce-5eeb47483d26', NULL, '{}'),
	('14684a05-a715-4b5c-b4e9-bfe0bbe2fc90', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/lateral.jpg', NULL, '2026-04-23 02:33:50.287003+00', '2026-04-23 02:33:50.287003+00', '2026-04-23 02:33:50.287003+00', '{"eTag": "\"80353f15825c4e3964b20d0d8fd149f5\"", "size": 479983, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:51.000Z", "contentLength": 479983, "httpStatusCode": 200}', '942e3dc1-cd39-4a4c-927f-289bef6dbf04', NULL, '{}'),
	('f9d68cf4-125f-438d-8f83-9208545b078e', 'order-photos', '1f7f754f-6e6e-4e9c-8088-4ccb6d1b7afd/packed-shipment.jpg', NULL, '2026-04-20 21:17:05.028005+00', '2026-04-20 21:17:05.028005+00', '2026-04-20 21:17:05.028005+00', '{"eTag": "\"9f3337a999d9f442f11830fb54b26c89\"", "size": 359081, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-20T21:17:05.000Z", "contentLength": 359081, "httpStatusCode": 200}', 'a4bf2439-bd4e-4518-98d6-4e1e28e1fba0', NULL, '{}'),
	('d08e28e3-ff80-4976-9868-4bb1108c1176', 'profile-images', '04d7fa56-c016-4711-8cf6-f3c202037666/banner-1776733114023.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-21 00:58:34.755908+00', '2026-04-21 00:58:34.755908+00', '2026-04-21 00:58:34.755908+00', '{"eTag": "\"8c50d24d39e81f043bc26f94045152d0\"", "size": 1038861, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T00:58:35.000Z", "contentLength": 1038861, "httpStatusCode": 200}', '47d67c66-8986-44a4-a6ff-675a35544d18', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('9929f5d6-a888-429c-9b38-adbdf541d920', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/sole.jpg', NULL, '2026-04-23 02:33:50.917993+00', '2026-04-23 02:33:50.917993+00', '2026-04-23 02:33:50.917993+00', '{"eTag": "\"41f110fb58095aa17fd097e9c91a998e\"", "size": 472075, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:51.000Z", "contentLength": 472075, "httpStatusCode": 200}', '3d8b24a2-9324-4db1-99cb-4a7e962dcc02', NULL, '{}'),
	('dcf55386-0636-4767-96c7-2960e847b60f', 'profile-images', '04d7fa56-c016-4711-8cf6-f3c202037666/avatar-1776733114823.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-21 00:58:35.377051+00', '2026-04-21 00:58:35.377051+00', '2026-04-21 00:58:35.377051+00', '{"eTag": "\"70fa35e3803b232ec1fce39b61330121\"", "size": 1475591, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T00:58:36.000Z", "contentLength": 1475591, "httpStatusCode": 200}', '9d3c3ecc-80a0-485d-8713-7082c922de52', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('43a0ef6b-a7f6-4007-9faf-757786337518', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/checkcheck-certificate.pdf', NULL, '2026-04-21 03:12:38.95473+00', '2026-04-21 03:12:38.95473+00', '2026-04-21 03:12:38.95473+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:39.000Z", "contentLength": 186219, "httpStatusCode": 200}', '82ffcbd3-1139-48bc-8b43-34b9c5c6e25e', NULL, '{}'),
	('5e531803-5c9f-43cf-9fba-0f14dd239b51', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/size-tag.jpg', NULL, '2026-04-23 02:33:51.530931+00', '2026-04-23 02:33:51.530931+00', '2026-04-23 02:33:51.530931+00', '{"eTag": "\"2724ff8c6630433fdc45543d55cbabce\"", "size": 487338, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:52.000Z", "contentLength": 487338, "httpStatusCode": 200}', 'b39fe5d8-f362-4b94-809c-082ea56801f9', NULL, '{}'),
	('b1c5380a-3bee-48e8-b419-c09b40dbfe32', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/front.jpg', NULL, '2026-04-21 03:12:40.942385+00', '2026-04-21 03:12:40.942385+00', '2026-04-21 03:12:40.942385+00', '{"eTag": "\"2b4ac8ba82da741d54139a742fccadc6\"", "size": 483184, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:41.000Z", "contentLength": 483184, "httpStatusCode": 200}', '84ba3e5c-29c9-4fc3-9851-6e0a5ed2aeae', NULL, '{}'),
	('e1c5b33f-cca0-47b6-8336-6f2ce1345748', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/back.jpg', NULL, '2026-04-21 03:12:41.847331+00', '2026-04-21 03:12:41.847331+00', '2026-04-21 03:12:41.847331+00', '{"eTag": "\"dbe954fe4b4fa66dba1488189d3f6f90\"", "size": 508500, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:42.000Z", "contentLength": 508500, "httpStatusCode": 200}', 'c3b81805-52a3-4918-bd9c-1c3bc6bf6410', NULL, '{}'),
	('4ea1cba7-ac2b-457e-a0d7-f62012953f4e', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/medial.jpg', NULL, '2026-04-21 03:12:42.819723+00', '2026-04-21 03:12:42.819723+00', '2026-04-21 03:12:42.819723+00', '{"eTag": "\"5c566d889be3c0d0430442b5ea16c72f\"", "size": 662174, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:43.000Z", "contentLength": 662174, "httpStatusCode": 200}', 'c318f8ed-9e86-4f8b-a546-3100a5fd5fb9', NULL, '{}'),
	('319bad01-5b08-4cf0-9afe-89e694a35bea', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/lateral.jpg', NULL, '2026-04-21 03:12:43.55028+00', '2026-04-21 03:12:43.55028+00', '2026-04-21 03:12:43.55028+00', '{"eTag": "\"3938bba0c698ac087cf1165c0fa414f9\"", "size": 508209, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:44.000Z", "contentLength": 508209, "httpStatusCode": 200}', '34fd33fd-3521-47fd-a8a6-813ccb4d2e19', NULL, '{}'),
	('20921e4e-c366-46d9-b2f5-dc6dac811316', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/challenge-code.jpg', NULL, '2026-04-23 02:33:52.101921+00', '2026-04-23 02:33:52.101921+00', '2026-04-23 02:33:52.101921+00', '{"eTag": "\"4b8368f9df893711488d40106ec1e7b2\"", "size": 458519, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:53.000Z", "contentLength": 458519, "httpStatusCode": 200}', '16193982-ebd7-4e27-9f21-812e7025d1fd', NULL, '{}'),
	('57589a26-b89a-457a-9b21-00149730660d', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/sole.jpg', NULL, '2026-04-21 03:12:44.769883+00', '2026-04-21 03:12:44.769883+00', '2026-04-21 03:12:44.769883+00', '{"eTag": "\"4c09e5d12d3b095b413a707a38c68672\"", "size": 512200, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:45.000Z", "contentLength": 512200, "httpStatusCode": 200}', '5ed4cac9-3dab-410e-9c57-024080517fe7', NULL, '{}'),
	('d8a1d003-f97c-4aee-b71e-86d13c676f7b', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/size-tag.jpg', NULL, '2026-04-21 03:12:45.601161+00', '2026-04-21 03:12:45.601161+00', '2026-04-21 03:12:45.601161+00', '{"eTag": "\"cabf563b60395ba3cb403c5ba23978e0\"", "size": 685435, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:46.000Z", "contentLength": 685435, "httpStatusCode": 200}', '86f069e3-8845-412b-bb95-cad6a81aab02', NULL, '{}'),
	('dadc77f5-9464-4a7b-91f0-a1eccf3e0dfd', 'order-photos', '284e0161-64bf-4161-9c12-e295df224422/packed-shipment.jpg', NULL, '2026-04-23 02:33:52.962597+00', '2026-04-23 02:33:52.962597+00', '2026-04-23 02:33:52.962597+00', '{"eTag": "\"9327b32f33820aaaf776b1cc9d9e8a4d\"", "size": 464099, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T02:33:53.000Z", "contentLength": 464099, "httpStatusCode": 200}', '060636eb-82ae-4e6c-834c-b1d22d868654', NULL, '{}'),
	('a764ecb6-14a0-4b07-bb9c-86ea1898bb8b', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/challenge-code.jpg', NULL, '2026-04-21 03:12:46.42509+00', '2026-04-21 03:12:46.42509+00', '2026-04-21 03:12:46.42509+00', '{"eTag": "\"75913dcaf989dac9cee537adcdf3c3a4\"", "size": 522166, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:47.000Z", "contentLength": 522166, "httpStatusCode": 200}', 'af7a8910-268c-4834-ade8-cc57a0e6fca1', NULL, '{}'),
	('1348ca9b-37bd-4cca-beb1-dc88edf3d640', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/challenge-code.jpg', NULL, '2026-04-23 03:53:00.314533+00', '2026-04-23 03:53:00.314533+00', '2026-04-23 03:53:00.314533+00', '{"eTag": "\"5a3e78c9169d0130f6331c797a5dcb4a\"", "size": 468379, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:53:01.000Z", "contentLength": 468379, "httpStatusCode": 200}', 'a8a3fbe7-d10c-4a2b-8c1a-baee61cefcc3', NULL, '{}'),
	('13d955ae-79b7-4a18-a982-601a748fb1e6', 'order-photos', '3ceee8bc-8774-464d-96e0-3c89f9546149/packed-shipment.jpg', NULL, '2026-04-21 03:12:47.151676+00', '2026-04-21 03:12:47.151676+00', '2026-04-21 03:12:47.151676+00', '{"eTag": "\"29b303ab0c60b4324788ea1d2e1c3ea7\"", "size": 459475, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:12:48.000Z", "contentLength": 459475, "httpStatusCode": 200}', 'a377ade5-8612-4129-858c-53d40e359d99', NULL, '{}'),
	('27818bef-0c09-40c6-a271-2c28c6558cf7', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/checkcheck-certificate.pdf', NULL, '2026-04-21 03:26:43.711266+00', '2026-04-21 03:26:43.711266+00', '2026-04-21 03:26:43.711266+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:44.000Z", "contentLength": 186219, "httpStatusCode": 200}', '042eaf9e-6fee-430c-861a-b566cf5ef000', NULL, '{}'),
	('73a07358-9101-4a53-bb5f-192340f40a46', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/packed-shipment.jpg', NULL, '2026-04-23 03:53:01.057129+00', '2026-04-23 03:53:01.057129+00', '2026-04-23 03:53:01.057129+00', '{"eTag": "\"d777ef046b9090a681460ffc176fb243\"", "size": 518923, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:53:01.000Z", "contentLength": 518923, "httpStatusCode": 200}', '8e6f3aab-e001-49b1-b628-1e22fea7874c', NULL, '{}'),
	('871d305b-afec-4b8b-9ed6-6114149b0374', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/front.jpg', NULL, '2026-04-21 03:26:45.701337+00', '2026-04-21 03:26:45.701337+00', '2026-04-21 03:26:45.701337+00', '{"eTag": "\"a8a7dea6d70c4b90ef1b5d3d74285187\"", "size": 434284, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:46.000Z", "contentLength": 434284, "httpStatusCode": 200}', '3445e686-fd0b-4dab-9115-98835e012fc1', NULL, '{}'),
	('23101b72-68fd-4bf9-a405-8c73073e36ca', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/back.jpg', NULL, '2026-04-21 03:26:46.472388+00', '2026-04-21 03:26:46.472388+00', '2026-04-21 03:26:46.472388+00', '{"eTag": "\"4caf6323e16f491c68a333ac3c4425b7\"", "size": 468365, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:47.000Z", "contentLength": 468365, "httpStatusCode": 200}', 'd9093e3a-ae82-4302-a9f5-6cf6441b1fd6', NULL, '{}'),
	('e893eda4-b910-4cc2-8029-1a0f13e322d4', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/medial.jpg', NULL, '2026-04-21 03:26:47.141679+00', '2026-04-21 03:26:47.141679+00', '2026-04-21 03:26:47.141679+00', '{"eTag": "\"ef71cdf49915aa2b0f123611fe32c0e6\"", "size": 474042, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:48.000Z", "contentLength": 474042, "httpStatusCode": 200}', '3a66e37b-d1c8-4db1-b909-6649e9c4e6ba', NULL, '{}'),
	('e4d14cf3-382a-4bcf-86f4-39f5b119aa03', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/lateral.jpg', NULL, '2026-04-21 03:26:47.948517+00', '2026-04-21 03:26:47.948517+00', '2026-04-21 03:26:47.948517+00', '{"eTag": "\"40a15a161ba9ce538b826d623766e759\"", "size": 502046, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:48.000Z", "contentLength": 502046, "httpStatusCode": 200}', '69c35c01-4f51-4ebb-a7fb-8e0c025f4a67', NULL, '{}'),
	('ffd89eed-0cf2-4c50-9b94-c6057b1a7664', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/sole.jpg', NULL, '2026-04-21 03:26:48.594063+00', '2026-04-21 03:26:48.594063+00', '2026-04-21 03:26:48.594063+00', '{"eTag": "\"d07c4bc7f90ccfaacb6a4dcd3d3ba915\"", "size": 538480, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:49.000Z", "contentLength": 538480, "httpStatusCode": 200}', 'dbb29c83-be50-4205-a67a-bccbff09f424', NULL, '{}'),
	('58c7da69-3ba9-4617-876a-43a4d7cf3d7d', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/size-tag.jpg', NULL, '2026-04-21 03:26:49.270573+00', '2026-04-21 03:26:49.270573+00', '2026-04-21 03:26:49.270573+00', '{"eTag": "\"9cda955f2d570970ccb8c9bb38955529\"", "size": 444642, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:50.000Z", "contentLength": 444642, "httpStatusCode": 200}', '3078cfec-5fbe-4587-90a5-3ec59ae3a147', NULL, '{}'),
	('46150962-2352-4cb2-a340-88400f381ecf', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/checkcheck-certificate.pdf', NULL, '2026-04-23 03:51:17.424651+00', '2026-04-23 03:51:17.424651+00', '2026-04-23 03:51:17.424651+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:51:18.000Z", "contentLength": 186219, "httpStatusCode": 200}', 'caee1449-4208-4ef5-bd2a-aa9a252ad688', NULL, '{}'),
	('da32382d-372c-40eb-99e0-83a801e853b1', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/challenge-code.jpg', NULL, '2026-04-21 03:26:49.980318+00', '2026-04-21 03:26:49.980318+00', '2026-04-21 03:26:49.980318+00', '{"eTag": "\"1b7236efdac692397342ad8168642070\"", "size": 485373, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:50.000Z", "contentLength": 485373, "httpStatusCode": 200}', 'f8da5267-aab4-49b6-a087-d9da9e91e9d8', NULL, '{}'),
	('f4cbd680-9135-4084-8cc6-50e0a49eea39', 'order-photos', '8d8cb167-a352-476d-908f-5bc4a7d8cba4/packed-shipment.jpg', NULL, '2026-04-21 03:26:50.638751+00', '2026-04-21 03:26:50.638751+00', '2026-04-21 03:26:50.638751+00', '{"eTag": "\"d93f9aa3bc196d856eb079d9da2c6687\"", "size": 495709, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T03:26:51.000Z", "contentLength": 495709, "httpStatusCode": 200}', '59da3983-4bce-4f2c-b582-3701b8e1c154', NULL, '{}'),
	('d0ad2cad-dbb4-414b-a118-ad7e11da8e9f', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/front.jpg', NULL, '2026-04-23 03:51:46.554359+00', '2026-04-23 03:51:46.554359+00', '2026-04-23 03:51:46.554359+00', '{"eTag": "\"29a4bb7f04830cdaff6f93c67a7b2fd8\"", "size": 430709, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:51:47.000Z", "contentLength": 430709, "httpStatusCode": 200}', '0b3d88b2-dd05-4324-a1db-580691be780e', NULL, '{}'),
	('5a00208b-f003-4bf5-a976-cdebdff51d9c', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/checkcheck-certificate.pdf', NULL, '2026-04-21 04:19:25.098175+00', '2026-04-21 04:19:25.098175+00', '2026-04-21 04:19:25.098175+00', '{"eTag": "\"fdbc20ad737a4e0b19c2818d04d00660\"", "size": 186219, "mimetype": "application/pdf", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:26.000Z", "contentLength": 186219, "httpStatusCode": 200}', '4eff6c98-8275-4a49-8e88-428ea3ff67ec', NULL, '{}'),
	('c6eafca3-5619-404a-ba13-7a479641643a', 'order-photos', '76e7be33-2a0f-41c2-9a07-5095d23b5d38/front.jpg', NULL, '2026-04-21 04:19:27.097022+00', '2026-04-21 04:19:27.097022+00', '2026-04-21 04:19:27.097022+00', '{"eTag": "\"0ca48aed6d79a7353af6c69a0a2457a9\"", "size": 488467, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-21T04:19:28.000Z", "contentLength": 488467, "httpStatusCode": 200}', 'f23dd661-bfab-4fd3-9983-31b9721601de', NULL, '{}'),
	('6b526dba-f504-4fc0-8411-531fe0609199', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/back.jpg', NULL, '2026-04-23 03:52:11.018259+00', '2026-04-23 03:52:11.018259+00', '2026-04-23 03:52:11.018259+00', '{"eTag": "\"0a8ab83d96ce6dadeafb6254b4b023d0\"", "size": 440172, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:52:11.000Z", "contentLength": 440172, "httpStatusCode": 200}', 'b6c15e29-ce71-4745-9683-36928701fabb', NULL, '{}'),
	('f2b8f3e5-1832-47bf-be31-cbc7eb93d3f1', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/medial.jpg', NULL, '2026-04-23 03:52:50.080138+00', '2026-04-23 03:52:50.080138+00', '2026-04-23 03:52:50.080138+00', '{"eTag": "\"05fd563fcbf5481ac74dc5fbd04b833b\"", "size": 457983, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:52:50.000Z", "contentLength": 457983, "httpStatusCode": 200}', '6da77f3e-cfc3-481d-8782-126d1b22ec69', NULL, '{}'),
	('4e796672-7bab-4a5d-8f61-da8d893ccd2e', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/lateral.jpg', NULL, '2026-04-23 03:52:57.82248+00', '2026-04-23 03:52:57.82248+00', '2026-04-23 03:52:57.82248+00', '{"eTag": "\"ecf629c11cbe0a1e4e354ceda0b11921\"", "size": 469364, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:52:58.000Z", "contentLength": 469364, "httpStatusCode": 200}', '37bbe7f5-811d-41c5-8c71-5bd50f268152', NULL, '{}'),
	('6ed3875c-da78-44d4-9f03-0d4162a4a423', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/sole.jpg', NULL, '2026-04-23 03:52:58.949559+00', '2026-04-23 03:52:58.949559+00', '2026-04-23 03:52:58.949559+00', '{"eTag": "\"262834671b490491561bcdbaa922e42c\"", "size": 498397, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:52:59.000Z", "contentLength": 498397, "httpStatusCode": 200}', '5a4a283c-72b2-47ea-81dc-d629265bc348', NULL, '{}'),
	('9259d121-272a-4f30-b62c-46e9ca062482', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/dispute-buyer-0.jpg', NULL, '2026-04-23 03:56:19.512924+00', '2026-04-23 03:56:19.512924+00', '2026-04-23 03:56:19.512924+00', '{"eTag": "\"8f40a75c76324fc424e437faf148f62f\"", "size": 379469, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:56:20.000Z", "contentLength": 379469, "httpStatusCode": 200}', '0f309a48-2f29-426b-af25-e3107e3e7a88', NULL, '{}'),
	('cccbe852-63c6-4a63-9526-c38157676641', 'order-photos', '2a3c17ee-e3f8-435f-9f13-7cc4bc82f285/dispute-seller-0.jpg', NULL, '2026-04-23 03:57:38.067138+00', '2026-04-23 03:57:38.067138+00', '2026-04-23 03:57:38.067138+00', '{"eTag": "\"9eea8bbfafa09d3ede35d26ea3ee3d3e\"", "size": 288986, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T03:57:39.000Z", "contentLength": 288986, "httpStatusCode": 200}', '1d50a20d-d3c2-418b-b492-df5c1cedecd9', NULL, '{}'),
	('8c627bc6-a3ec-4f0e-b52d-71690819c680', 'profile-images', '04d7fa56-c016-4711-8cf6-f3c202037666/post-1776921239289-0.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-23 05:13:59.165818+00', '2026-04-23 05:13:59.165818+00', '2026-04-23 05:13:59.165818+00', '{"eTag": "\"c2bb297a36cad850f27ce4997a97aa20\"", "size": 129482, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T05:14:00.000Z", "contentLength": 129482, "httpStatusCode": 200}', 'ba64f8ac-f885-488e-b9dd-7cd47dbbe85d', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('d2973263-57a5-4229-9954-b9b071c2b408', 'profile-images', '04d7fa56-c016-4711-8cf6-f3c202037666/post-1776921240003-1.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-23 05:13:59.406102+00', '2026-04-23 05:13:59.406102+00', '2026-04-23 05:13:59.406102+00', '{"eTag": "\"c1be259821d7ad71fde6bbbb774d3ae3\"", "size": 23996, "mimetype": "image/avif", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T05:14:00.000Z", "contentLength": 23996, "httpStatusCode": 200}', '94d66ccf-e48b-42a9-94e7-4b59a27db134', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('836e7648-2be2-4a21-ae99-e1d35b76072c', 'profile-images', '04d7fa56-c016-4711-8cf6-f3c202037666/post-1776921240248-2.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-23 05:13:59.925596+00', '2026-04-23 05:13:59.925596+00', '2026-04-23 05:13:59.925596+00', '{"eTag": "\"0483172dec153b168db829f16617bc9d\"", "size": 34942, "mimetype": "image/webp", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T05:14:00.000Z", "contentLength": 34942, "httpStatusCode": 200}', '9748244a-fd50-481f-b764-adde6b795105', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('1a83cdd1-0ce1-426b-8cab-ebf2b28f3351', 'listing-images', '04d7fa56-c016-4711-8cf6-f3c202037666/1776924936159-0.8280682238706629.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-23 06:15:35.633889+00', '2026-04-23 06:15:35.633889+00', '2026-04-23 06:15:35.633889+00', '{"eTag": "\"a223772696b53e549e63e4a2fcfbcf2a\"", "size": 21225, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T06:15:36.000Z", "contentLength": 21225, "httpStatusCode": 200}', 'f780a66b-2eb2-458f-a0be-2f5947f48635', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('f7399c96-75ff-4135-a5cf-458642f77e2e', 'listing-images', '04d7fa56-c016-4711-8cf6-f3c202037666/1776927077145-0.9751369795915544.jpg', '04d7fa56-c016-4711-8cf6-f3c202037666', '2026-04-23 06:51:16.389972+00', '2026-04-23 06:51:16.389972+00', '2026-04-23 06:51:16.389972+00', '{"eTag": "\"a223772696b53e549e63e4a2fcfbcf2a\"", "size": 21225, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-23T06:51:17.000Z", "contentLength": 21225, "httpStatusCode": 200}', '90e8a5fd-a980-40d0-8f32-065b7f23282a', '04d7fa56-c016-4711-8cf6-f3c202037666', '{}'),
	('357d0a10-341f-43ff-b9f7-d910370cc507', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/banner-1777165893064.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:11:32.059345+00', '2026-04-26 01:11:32.059345+00', '2026-04-26 01:11:32.059345+00', '{"eTag": "\"c2fb3d03cd8945305589fe185d003793\"", "size": 18564, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:11:33.000Z", "contentLength": 18564, "httpStatusCode": 200}', 'd0b7dac7-ce20-4e19-893b-5932b5198434', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('7df76d5e-e5d6-4945-a0b6-dce682028ca4', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/avatar-1777165893466.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:11:32.363568+00', '2026-04-26 01:11:32.363568+00', '2026-04-26 01:11:32.363568+00', '{"eTag": "\"a18b9b2d1acfdd5c36bc1b8309767d71\"", "size": 90271, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:11:33.000Z", "contentLength": 90271, "httpStatusCode": 200}', 'bec532fc-2cc2-48ba-8b03-af7d390461de', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('faa4f1eb-2fb3-4859-88b7-343cfc30008f', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166308386-0.26089913395320574.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:18:27.52196+00', '2026-04-26 01:18:27.52196+00', '2026-04-26 01:18:27.52196+00', '{"eTag": "\"b2e2410186fd931c71b4a9850676cfae\"", "size": 489413, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:18:28.000Z", "contentLength": 489413, "httpStatusCode": 200}', 'a7378237-82e3-4a76-9fdb-3040a41b3c7e', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('4ce21c1f-617d-456a-a0e7-74efde8268af', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166308948-0.16489184043392002.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:18:27.876162+00', '2026-04-26 01:18:27.876162+00', '2026-04-26 01:18:27.876162+00', '{"eTag": "\"089c18ee8e748aafb6d1a0e0707cdc97\"", "size": 427467, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:18:28.000Z", "contentLength": 427467, "httpStatusCode": 200}', '710cecb3-d109-429a-afc5-7e33e59f7eab', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('0f0001a7-bad5-4753-a1cc-4b3cd77a4a19', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166309307-0.4662324689272792.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:18:28.195123+00', '2026-04-26 01:18:28.195123+00', '2026-04-26 01:18:28.195123+00', '{"eTag": "\"8f345ed3963c37058f7f2060ce3b40d8\"", "size": 285761, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:18:29.000Z", "contentLength": 285761, "httpStatusCode": 200}', '9c1c3f50-eab5-442d-bd0e-8d67495d8283', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('b26511af-faef-4d0a-9473-bca77ee14ee2', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166547714-0.23301015816086168.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:22:27.407149+00', '2026-04-26 01:22:27.407149+00', '2026-04-26 01:22:27.407149+00', '{"eTag": "\"457a03e6064d19a2ec566fcbd7e1a7a4\"", "size": 2465744, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:22:28.000Z", "contentLength": 2465744, "httpStatusCode": 200}', 'b579743c-2a68-4a27-b6d9-d4c59665dd92', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('7d22dba7-ab6f-4bde-aab8-84b162d5a7af', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166549005-0.5319459631191118.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:22:28.548331+00', '2026-04-26 01:22:28.548331+00', '2026-04-26 01:22:28.548331+00', '{"eTag": "\"f82e3dfa41fefccec63becd44b62e4dc\"", "size": 2595291, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:22:29.000Z", "contentLength": 2595291, "httpStatusCode": 200}', '446041d3-0c22-4b9a-b730-ba88099beed9', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('9a25ab46-ba04-4441-b0e2-ffa2b7df6b2e', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166550000-0.2696070780481342.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:22:29.573178+00', '2026-04-26 01:22:29.573178+00', '2026-04-26 01:22:29.573178+00', '{"eTag": "\"e807f3b01016b7368141a038d0d1638f\"", "size": 2680838, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:22:30.000Z", "contentLength": 2680838, "httpStatusCode": 200}', '59ecca93-8e7f-4a8f-8d5e-85d58c33f71d', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('11774517-144d-470a-8ce8-f0dd8e0eda25', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166551016-0.7498571886068766.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:22:30.419043+00', '2026-04-26 01:22:30.419043+00', '2026-04-26 01:22:30.419043+00', '{"eTag": "\"10d5a0968672874cbca09e3bfc106a2c\"", "size": 2633694, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:22:31.000Z", "contentLength": 2633694, "httpStatusCode": 200}', '56824599-1fbe-456a-a9cd-6ee4260c6499', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('20fcd606-506e-44e1-a7e6-7ea4d9750550', 'listing-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/1777166551863-0.598181293322343.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:22:32.327799+00', '2026-04-26 01:22:32.327799+00', '2026-04-26 01:22:32.327799+00', '{"eTag": "\"3884e5032524a0576ad8832e9de6fa54-2\"", "size": 5985236, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:22:32.000Z", "contentLength": 5985236, "httpStatusCode": 200}', 'd70ba4bf-de80-42a9-8df2-0a87f3ab66da', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('4fe92163-8ceb-4b7b-b84a-86b0f1d243ed', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/post-1777167070605-0.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:31:09.646953+00', '2026-04-26 01:31:09.646953+00', '2026-04-26 01:31:09.646953+00', '{"eTag": "\"b2e2410186fd931c71b4a9850676cfae\"", "size": 489413, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:31:10.000Z", "contentLength": 489413, "httpStatusCode": 200}', '4a7f937d-5930-4fcd-af71-b6a7b27eff14', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('f8f18d00-952e-4150-a027-cb794bddc418', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/post-1777167071127-1.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:31:10.035797+00', '2026-04-26 01:31:10.035797+00', '2026-04-26 01:31:10.035797+00', '{"eTag": "\"089c18ee8e748aafb6d1a0e0707cdc97\"", "size": 427467, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:31:10.000Z", "contentLength": 427467, "httpStatusCode": 200}', '71efd4ad-f728-4492-9378-b3a9d92a089a', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('7a000c34-e9fe-42cb-bc34-565568ffcb44', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/post-1777167071529-2.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:31:10.599526+00', '2026-04-26 01:31:10.599526+00', '2026-04-26 01:31:10.599526+00', '{"eTag": "\"8f345ed3963c37058f7f2060ce3b40d8\"", "size": 285761, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:31:11.000Z", "contentLength": 285761, "httpStatusCode": 200}', '8ba706e2-d7ae-4171-8b98-faff419f3fea', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('ca174344-7e34-4629-b0ce-711b5dac1ae6', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/post-1777167196729-0.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:33:16.33101+00', '2026-04-26 01:33:16.33101+00', '2026-04-26 01:33:16.33101+00', '{"eTag": "\"457a03e6064d19a2ec566fcbd7e1a7a4\"", "size": 2465744, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:33:17.000Z", "contentLength": 2465744, "httpStatusCode": 200}', 'b6f5ff54-5f8b-42de-ad75-78c523eb58f4', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('f6bb3980-07f1-4c5f-8684-6b560daa6a94', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/post-1777167197832-1.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:33:17.342779+00', '2026-04-26 01:33:17.342779+00', '2026-04-26 01:33:17.342779+00', '{"eTag": "\"10d5a0968672874cbca09e3bfc106a2c\"", "size": 2633694, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:33:18.000Z", "contentLength": 2633694, "httpStatusCode": 200}', '7c08c5d3-2630-4429-a442-9ea3c6b52882', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('0eea286d-1076-4739-a128-dae52ae82746', 'profile-images', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4/post-1777167198827-2.jpg', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '2026-04-26 01:33:19.144785+00', '2026-04-26 01:33:19.144785+00', '2026-04-26 01:33:19.144785+00', '{"eTag": "\"3884e5032524a0576ad8832e9de6fa54-2\"", "size": 5985236, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-04-26T01:33:19.000Z", "contentLength": 5985236, "httpStatusCode": 200}', '4dcce346-5819-4c18-8625-c9ef178ed630', '1e4dcbaf-ac82-4878-af7a-6aa57d7642b4', '{}'),
	('88ffc4c9-ba48-4bb4-a860-2447daf11495', 'profile-images', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2/avatar-1777778165185.jpg', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-03 03:16:03.762946+00', '2026-05-03 03:16:03.762946+00', '2026-05-03 03:16:03.762946+00', '{"eTag": "\"2d8963b618c75d6ae448a97b60a44a19\"", "size": 183498, "mimetype": "image/jpeg", "cacheControl": "max-age=3600", "lastModified": "2026-05-03T03:16:04.000Z", "contentLength": 183498, "httpStatusCode": 200}', '8c1d4816-1f6d-4bc2-8f2c-01dcb5cb917d', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '{}'),
	('385ebbe1-47db-4a78-92c2-e1a702acd60b', 'profile-images', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2/banner-1777778588271.jpg', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-03 03:23:07.322071+00', '2026-05-03 03:23:07.322071+00', '2026-05-03 03:23:07.322071+00', '{"eTag": "\"4a8bf3bb4ba20dce5b97dbe987c84963\"", "size": 1029763, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-05-03T03:23:08.000Z", "contentLength": 1029763, "httpStatusCode": 200}', '6abebd76-1ae4-47c4-9c83-bdca4b598b30', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '{}'),
	('f7c1484c-df93-4d29-8beb-07d891501835', 'profile-images', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2/post-1777778942902-0.jpg', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-03 03:29:01.817952+00', '2026-05-03 03:29:01.817952+00', '2026-05-03 03:29:01.817952+00', '{"eTag": "\"29722f39bbcfa40e731f3fe85fdc4ead\"", "size": 1305862, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-05-03T03:29:02.000Z", "contentLength": 1305862, "httpStatusCode": 200}', '3a71ce36-45e1-4138-88f6-00d691271b11', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '{}'),
	('e35f26a3-89a6-4797-9313-9987f3175611', 'profile-images', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2/post-1777778943909-1.jpg', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '2026-05-03 03:29:02.717545+00', '2026-05-03 03:29:02.717545+00', '2026-05-03 03:29:02.717545+00', '{"eTag": "\"f6792a351069480668e94d960dcd566c\"", "size": 1404812, "mimetype": "image/png", "cacheControl": "max-age=3600", "lastModified": "2026-05-03T03:29:03.000Z", "contentLength": 1404812, "httpStatusCode": 200}', '96124588-07e4-4e7b-b1f1-0ede23f8b5c4', 'ec8e553e-f4cf-4c88-bd71-b303b55e08b2', '{}');


--
-- Data for Name: s3_multipart_uploads; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: s3_multipart_uploads_parts; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Data for Name: vector_indexes; Type: TABLE DATA; Schema: storage; Owner: supabase_storage_admin
--



--
-- Name: refresh_tokens_id_seq; Type: SEQUENCE SET; Schema: auth; Owner: supabase_auth_admin
--

SELECT pg_catalog.setval('"auth"."refresh_tokens_id_seq"', 353, true);


--
-- PostgreSQL database dump complete
--

-- \unrestrict 8M23fYmuerA5UWWvEwvg8jhs3Bg6LJbZ7I861crNFeebWHwtbV3kvBaX1JVguCV

RESET ALL;
