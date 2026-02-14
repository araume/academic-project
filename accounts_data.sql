--
-- PostgreSQL database dump
--

\restrict jE1hcIucSbrLoRZRMd4ExEuGlRr8YYrn2rmZgqaG7mHAcM8tPRfyePhZWUSqGqw

-- Dumped from database version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.11 (Ubuntu 16.11-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: marklester
--

INSERT INTO public.accounts (id, email, uid, password, username, display_name, course, recovery_email, datecreated, platform_role, email_verified, email_verified_at, is_banned, banned_at, banned_reason, banned_by_uid) VALUES (5, 'm.azino1800@gmail.com', '5e10f635-f669-4da4-beba-848c29f4ce66', 'scrypt:16384:8:1:ae08e9b461886545f00123a94c0773f1:47f230d3bcd33f9fd3f6c535d089548d7344e466d627d929bb16655febe991013136def109dc0fb6a89de333b36ac90f4dc5bbc3364dcb455d21628b08be802f', 'marklesterc', 'Mark Lester', 'Geography', 'markambida11@gmail.com', '2026-02-14 11:47:16.604+08', 'member', false, NULL, false, NULL, NULL, NULL);
INSERT INTO public.accounts (id, email, uid, password, username, display_name, course, recovery_email, datecreated, platform_role, email_verified, email_verified_at, is_banned, banned_at, banned_reason, banned_by_uid) VALUES (4, 'wiseblood018@gmail.com', '614b5df1-7ba2-48b2-82d5-ddfb0dda4a55', 'scrypt:16384:8:1:0c6ed728704d5778ed1313144af997ab:7e56894d033fdc5121175f16bb2ae0d01763304a15f6bbc03fc627a69849cef9f1bfc8a1db26e05434142ee91d1fb69fda3cc2d84db5d4291a593e44a07ff318', 'marklester', 'Substack', 'Computer Science', 'markambida11@gmail.com', '2026-02-13 22:32:18.113+08', 'member', true, '2026-02-14 11:51:19.445994+08', false, NULL, NULL, NULL);
INSERT INTO public.accounts (id, email, uid, password, username, display_name, course, recovery_email, datecreated, platform_role, email_verified, email_verified_at, is_banned, banned_at, banned_reason, banned_by_uid) VALUES (1, 'markambida11@gmail.com', '45cd2fda-ece1-46ba-8e5b-7e91c296be46', 'scrypt:16384:8:1:4d75265cec2b9ecaaa70dd5d4db27487:f76358e4d877298d45629a9b7bfd7329dc10c1adf4c4f488f1b250b0567374b5d7637919cf910c05b07272960863d67158d60e9e56c06ff801e0ed2a5c982305', 'reonah', 'Mark Lester', 'BSCS', 'markcastillo875@gmail.com', '2026-01-30 23:33:33.21+08', 'owner', true, '2026-02-14 11:51:19.445994+08', false, NULL, NULL, NULL);
INSERT INTO public.accounts (id, email, uid, password, username, display_name, course, recovery_email, datecreated, platform_role, email_verified, email_verified_at, is_banned, banned_at, banned_reason, banned_by_uid) VALUES (2, 'markcastillo875@gmail.com', '6ca79bfd-0cb0-4aa1-be02-16ab659fadff', 'scrypt:16384:8:1:d24a0e8294a61dcbe0ae7ab5865aebe9:bd5e2ebadc83a89554dbb596c1cc06e6eed02d35a746caf6946dc4b7b66531cdb0b0f93515d35e3b6a9409270c740a0e66ea6c67aa4a66abdecd72e942ff542c', 'reonah', 'Mark Lester Ambida', 'Computer Science', 'markambida11@gmail.com', '2026-02-13 12:03:07.182+08', 'admin', true, '2026-02-14 11:51:19.445994+08', false, NULL, NULL, NULL);
INSERT INTO public.accounts (id, email, uid, password, username, display_name, course, recovery_email, datecreated, platform_role, email_verified, email_verified_at, is_banned, banned_at, banned_reason, banned_by_uid) VALUES (3, 'thegreattuna018@gmail.com', '6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc', 'scrypt:16384:8:1:c8669590cfffb3cfc9b3495bf4bf8fd0:8397400a64fef3b0b0f6bfd76c6d4f60e19dd9a8d0520ffaacfaa379831bad3fa8a97b0e91b072bfeed8eba8d1c4c68f439b44d6adf09a83db3e0a5adb729cda', 'yaoyao', 'Chen Yao', 'Computer Science', 'markambida11@gmail.com', '2026-02-13 12:32:19.127+08', 'admin', true, '2026-02-14 11:51:19.445994+08', false, NULL, NULL, NULL);


--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: marklester
--

SELECT pg_catalog.setval('public.accounts_id_seq', 5, true);


--
-- PostgreSQL database dump complete
--

\unrestrict jE1hcIucSbrLoRZRMd4ExEuGlRr8YYrn2rmZgqaG7mHAcM8tPRfyePhZWUSqGqw

