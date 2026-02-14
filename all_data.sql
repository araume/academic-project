--
-- PostgreSQL database dump
--

\restrict AXZstk3Dk5Wx1obf8jAV5blUKXKj6J7QS37msyVqVXb94Ixgz5cDd7pFMnKdIQk

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
-- Data for Name: accounts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.accounts (id, email, uid, password, username, display_name, course, recovery_email, datecreated, platform_role, email_verified, email_verified_at, is_banned, banned_at, banned_reason, banned_by_uid) FROM stdin;
5	m.azino1800@gmail.com	5e10f635-f669-4da4-beba-848c29f4ce66	scrypt:16384:8:1:ae08e9b461886545f00123a94c0773f1:47f230d3bcd33f9fd3f6c535d089548d7344e466d627d929bb16655febe991013136def109dc0fb6a89de333b36ac90f4dc5bbc3364dcb455d21628b08be802f	marklesterc	Mark Lester	Geography	markambida11@gmail.com	2026-02-14 11:47:16.604+08	member	f	\N	f	\N	\N	\N
4	wiseblood018@gmail.com	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	scrypt:16384:8:1:0c6ed728704d5778ed1313144af997ab:7e56894d033fdc5121175f16bb2ae0d01763304a15f6bbc03fc627a69849cef9f1bfc8a1db26e05434142ee91d1fb69fda3cc2d84db5d4291a593e44a07ff318	marklester	Substack	Computer Science	markambida11@gmail.com	2026-02-13 22:32:18.113+08	member	t	2026-02-14 11:51:19.445994+08	f	\N	\N	\N
1	markambida11@gmail.com	45cd2fda-ece1-46ba-8e5b-7e91c296be46	scrypt:16384:8:1:4d75265cec2b9ecaaa70dd5d4db27487:f76358e4d877298d45629a9b7bfd7329dc10c1adf4c4f488f1b250b0567374b5d7637919cf910c05b07272960863d67158d60e9e56c06ff801e0ed2a5c982305	reonah	Mark Lester	BSCS	markcastillo875@gmail.com	2026-01-30 23:33:33.21+08	owner	t	2026-02-14 11:51:19.445994+08	f	\N	\N	\N
2	markcastillo875@gmail.com	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	scrypt:16384:8:1:d24a0e8294a61dcbe0ae7ab5865aebe9:bd5e2ebadc83a89554dbb596c1cc06e6eed02d35a746caf6946dc4b7b66531cdb0b0f93515d35e3b6a9409270c740a0e66ea6c67aa4a66abdecd72e942ff542c	reonah	Mark Lester Ambida	Computer Science	markambida11@gmail.com	2026-02-13 12:03:07.182+08	admin	t	2026-02-14 11:51:19.445994+08	f	\N	\N	\N
3	thegreattuna018@gmail.com	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	scrypt:16384:8:1:c8669590cfffb3cfc9b3495bf4bf8fd0:8397400a64fef3b0b0f6bfd76c6d4f60e19dd9a8d0520ffaacfaa379831bad3fa8a97b0e91b072bfeed8eba8d1c4c68f439b44d6adf09a83db3e0a5adb729cda	yaoyao	Chen Yao	Computer Science	markambida11@gmail.com	2026-02-13 12:32:19.127+08	admin	t	2026-02-14 11:51:19.445994+08	f	\N	\N	\N
\.


--
-- Data for Name: admin_audit_logs; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.admin_audit_logs (id, executor_uid, executor_role, action_key, action_type, target_type, target_id, course, source_path, metadata, created_at) FROM stdin;
1	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	member	POST:/api/profile/photo	POST /api/profile/photo	\N	\N	Computer Science	/api/profile/photo	{"method": "POST", "success": true, "durationMs": 1513, "statusCode": 200}	2026-02-14 13:31:01.847322+08
2	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	member	PATCH:/api/profile	PATCH /api/profile	\N	\N	Computer Science	/api/profile	{"method": "PATCH", "success": true, "durationMs": 5, "statusCode": 200}	2026-02-14 13:31:06.256055+08
\.


--
-- Data for Name: auth_schema_meta; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.auth_schema_meta (key, value, created_at) FROM stdin;
email_verification_legacy_backfill_done	true	2026-02-14 11:51:19.445994+08
\.


--
-- Data for Name: blocked_users; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.blocked_users (id, blocker_uid, blocked_uid, created_at) FROM stdin;
\.


--
-- Data for Name: chat_threads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_threads (id, thread_type, created_by_uid, title, created_at) FROM stdin;
1	direct	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	\N	2026-02-13 12:18:17.984776+08
2	direct	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	2026-02-13 21:34:24.444688+08
\.


--
-- Data for Name: chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_messages (id, thread_id, sender_uid, body, created_at) FROM stdin;
1	1	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	Hi	2026-02-13 12:18:27.836807+08
2	2	45cd2fda-ece1-46ba-8e5b-7e91c296be46	Hellooo	2026-02-13 21:35:06.364736+08
\.


--
-- Data for Name: chat_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_participants (id, thread_id, user_uid, role, status, joined_at, left_at) FROM stdin;
1	1	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	owner	active	2026-02-13 12:18:17.984776+08	\N
2	1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	member	active	2026-02-13 12:18:17.984776+08	\N
3	2	45cd2fda-ece1-46ba-8e5b-7e91c296be46	owner	active	2026-02-13 21:34:24.444688+08	\N
4	2	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	member	active	2026-02-13 21:34:24.444688+08	\N
\.


--
-- Data for Name: chat_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_requests (id, requester_uid, target_uid, status, created_at, updated_at) FROM stdin;
1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	accepted	2026-02-13 12:13:05.083536+08	2026-02-13 12:18:17.983254+08
2	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	45cd2fda-ece1-46ba-8e5b-7e91c296be46	accepted	2026-02-13 12:18:07.017244+08	2026-02-13 21:34:22.914246+08
3	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	45cd2fda-ece1-46ba-8e5b-7e91c296be46	accepted	2026-02-13 12:33:37.600058+08	2026-02-13 21:34:24.443294+08
\.


--
-- Data for Name: communities; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.communities (id, course_code, course_name, slug, description, created_at, updated_at) FROM stdin;
60	a3e78381c7f8	Mechanical Engineering	mechanical-engineering	\N	2026-02-13 22:27:01.043328+08	2026-02-14 13:32:05.553308+08
45	fbe72222d27b	Information Technology	information-technology	\N	2026-02-13 22:27:01.033236+08	2026-02-14 13:32:05.545109+08
49	99ff036fedc2	Journalism	journalism	\N	2026-02-13 22:27:01.035632+08	2026-02-14 13:32:05.547189+08
55	9180a4e233ed	Literature	literature	\N	2026-02-13 22:27:01.040023+08	2026-02-14 13:32:05.550729+08
30	b9b98aaba9af	Environmental Science	environmental-science	\N	2026-02-13 22:27:01.023941+08	2026-02-14 13:32:05.536813+08
84	\N	BSCS	bscs	\N	2026-02-13 22:27:01.061215+08	2026-02-14 12:59:28.72551+08
79	c48036bafbf8	Software Engineering	software-engineering	\N	2026-02-13 22:27:01.055144+08	2026-02-14 13:32:05.564188+08
74	2086e1e5001c	Public Relations	public-relations	\N	2026-02-13 22:27:01.052091+08	2026-02-14 13:32:05.560713+08
53	dbe3129fe055	Liberal Arts	liberal-arts	\N	2026-02-13 22:27:01.038302+08	2026-02-14 13:32:05.549597+08
69	e97d86e410c9	Physics	physics	\N	2026-02-13 22:27:01.048994+08	2026-02-14 13:32:05.558057+08
43	07802b7bb80f	Industrial Engineering	industrial-engineering	\N	2026-02-13 22:27:01.032052+08	2026-02-14 13:32:05.544072+08
16	45372655073c	Computer Science	computer-science	\N	2026-02-13 22:27:01.01402+08	2026-02-14 13:32:05.570301+08
31	40551b31846d	Film / Media Arts	film-media-arts	\N	2026-02-13 22:27:01.024558+08	2026-02-14 13:32:05.537302+08
4	757a4abe525b	Animal Science	animal-science	\N	2026-02-13 22:27:01.005508+08	2026-02-14 13:32:05.520636+08
65	19df6e167d24	Nutrition & Dietetics	nutrition-dietetics	\N	2026-02-13 22:27:01.046287+08	2026-02-14 13:32:05.55587+08
8	77d90a5a6295	Biology	biology	\N	2026-02-13 22:27:01.008266+08	2026-02-14 13:32:05.522706+08
19	4f51ad614d59	Data Science	data-science	\N	2026-02-13 22:27:01.01638+08	2026-02-14 13:32:05.530395+08
73	76e6dbc11403	Public Health	public-health	\N	2026-02-13 22:27:01.051448+08	2026-02-14 13:32:05.560213+08
13	7cf1eca87035	Civil Engineering	civil-engineering	\N	2026-02-13 22:27:01.01215+08	2026-02-14 13:32:05.526353+08
29	bcb6ff934566	Environmental Engineering	environmental-engineering	\N	2026-02-13 22:27:01.02334+08	2026-02-14 13:32:05.536327+08
34	ab2603a39d5d	Fisheries	fisheries	\N	2026-02-13 22:27:01.026462+08	2026-02-14 13:32:05.538817+08
75	e5f1ecb0bc28	Religious Studies	religious-studies	\N	2026-02-13 22:27:01.052724+08	2026-02-14 13:32:05.561323+08
12	675f72510846	Chemistry	chemistry	\N	2026-02-13 22:27:01.011474+08	2026-02-14 13:32:05.52577+08
26	1fad1af74935	Electronics Engineering	electronics-engineering	\N	2026-02-13 22:27:01.021553+08	2026-02-14 13:32:05.534828+08
82	870b5ddf96c4	Theater / Drama	theater-drama	\N	2026-02-13 22:27:01.056912+08	2026-02-14 13:32:05.566027+08
14	2c3a5b32d825	Communication Studies	communication-studies	\N	2026-02-13 22:27:01.012753+08	2026-02-14 13:32:05.527042+08
70	010f7e5430d6	Political Science	political-science	\N	2026-02-13 22:27:01.049636+08	2026-02-14 13:32:05.558576+08
64	bd87551f4a2f	Nursing	nursing	\N	2026-02-13 22:27:01.045653+08	2026-02-14 13:32:05.555382+08
17	78ee3db9d271	Criminology	criminology	\N	2026-02-13 22:27:01.014773+08	2026-02-14 13:32:05.529275+08
52	5cdece41acfe	Legal Studies	legal-studies	\N	2026-02-13 22:27:01.037608+08	2026-02-14 13:32:05.548848+08
71	9608a98f01a0	Psychology	psychology	\N	2026-02-13 22:27:01.050214+08	2026-02-14 13:32:05.559136+08
57	8c376d92ab2d	Marketing	marketing	\N	2026-02-13 22:27:01.041203+08	2026-02-14 13:32:05.551774+08
27	2ee198e4dcd5	Elementary Education	elementary-education	\N	2026-02-13 22:27:01.022174+08	2026-02-14 13:32:05.535352+08
35	d9e755436d60	Food Science	food-science	\N	2026-02-13 22:27:01.027057+08	2026-02-14 13:32:05.539401+08
76	7427c36f24a5	Secondary Education	secondary-education	\N	2026-02-13 22:27:01.053377+08	2026-02-14 13:32:05.562254+08
36	a83da8c8dfc8	Forestry	forestry	\N	2026-02-13 22:27:01.027637+08	2026-02-14 13:32:05.53996+08
21	d6cbdfd737df	Early Childhood Education	early-childhood-education	\N	2026-02-13 22:27:01.018041+08	2026-02-14 13:32:05.53142+08
44	ee792df819cc	Information Systems	information-systems	\N	2026-02-13 22:27:01.032645+08	2026-02-14 13:32:05.544581+08
24	5e3a1646dd1c	Education	education	\N	2026-02-13 22:27:01.020168+08	2026-02-14 13:32:05.533474+08
78	c193e6fa844b	Sociology	sociology	\N	2026-02-13 22:27:01.054574+08	2026-02-14 13:32:05.563606+08
11	e258c67a2d12	Chemical Engineering	chemical-engineering	\N	2026-02-13 22:27:01.010692+08	2026-02-14 13:32:05.525258+08
72	c58f21ad1242	Public Administration	public-administration	\N	2026-02-13 22:27:01.050822+08	2026-02-14 13:32:05.559692+08
6	5d6aab399056	Architecture	architecture	\N	2026-02-13 22:27:01.006831+08	2026-02-14 13:32:05.521637+08
20	ca5c6b9fa611	Dentistry	dentistry	\N	2026-02-13 22:27:01.017355+08	2026-02-14 13:32:05.530898+08
18	7aa9cdb3c7e4	Cybersecurity	cybersecurity	\N	2026-02-13 22:27:01.015602+08	2026-02-14 13:32:05.529893+08
7	07d8a57b7ca6	Astronomy	astronomy	\N	2026-02-13 22:27:01.00752+08	2026-02-14 13:32:05.522156+08
51	e38017766343	Law	law	\N	2026-02-13 22:27:01.03692+08	2026-02-14 13:32:05.548212+08
46	67f427c81b64	Interdisciplinary Studies	interdisciplinary-studies	\N	2026-02-13 22:27:01.033863+08	2026-02-14 13:32:05.545654+08
50	077ac2db842e	Languages	languages	\N	2026-02-13 22:27:01.036218+08	2026-02-14 13:32:05.54769+08
56	293cb4366897	Management	management	\N	2026-02-13 22:27:01.040593+08	2026-02-14 13:32:05.551268+08
28	9a0eea425009	Entrepreneurship	entrepreneurship	\N	2026-02-13 22:27:01.022753+08	2026-02-14 13:32:05.535844+08
9	5b8f655402bb	Biotechnology	biotechnology	\N	2026-02-13 22:27:01.009156+08	2026-02-14 13:32:05.523426+08
38	188f9ff0373b	Geography	geography	\N	2026-02-13 22:27:01.028836+08	2026-02-14 13:32:05.54114+08
80	97aead34ff06	Special Education	special-education	\N	2026-02-13 22:27:01.055729+08	2026-02-14 13:32:05.564687+08
32	abdba37fea96	Finance	finance	\N	2026-02-13 22:27:01.025197+08	2026-02-14 13:32:05.537804+08
62	cb5bb68af729	Medicine	medicine	\N	2026-02-13 22:27:01.044508+08	2026-02-14 13:32:05.554394+08
25	8bfbeeabbc40	Electrical Engineering	electrical-engineering	\N	2026-02-13 22:27:01.020849+08	2026-02-14 13:32:05.534142+08
59	702a54d073b2	Mathematics	mathematics	\N	2026-02-13 22:27:01.042696+08	2026-02-14 13:32:05.552739+08
67	ff67c64c62e3	Philosophy	philosophy	\N	2026-02-13 22:27:01.047572+08	2026-02-14 13:32:05.557039+08
40	271d54ff0289	History	history	\N	2026-02-13 22:27:01.030181+08	2026-02-14 13:32:05.542253+08
2	39bb7e5dabc6	Advertising	advertising	\N	2026-02-13 22:27:01.003853+08	2026-02-14 13:32:05.519435+08
54	34f26d5ae7df	Linguistics	linguistics	\N	2026-02-13 22:27:01.039201+08	2026-02-14 13:32:05.550184+08
58	e8919e420f3d	Mass Communication	mass-communication	\N	2026-02-13 22:27:01.041965+08	2026-02-14 13:32:05.552254+08
48	ef2f2e5bb636	International Relations	international-relations	\N	2026-02-13 22:27:01.035034+08	2026-02-14 13:32:05.546692+08
47	bba985ded2a6	Interior Design	interior-design	\N	2026-02-13 22:27:01.034451+08	2026-02-14 13:32:05.546185+08
42	6c5535662012	Industrial Design	industrial-design	\N	2026-02-13 22:27:01.031464+08	2026-02-14 13:32:05.543518+08
63	2e54b42c325e	Music	music	\N	2026-02-13 22:27:01.045072+08	2026-02-14 13:32:05.554894+08
68	8c861ac6747f	Physical Therapy	physical-therapy	\N	2026-02-13 22:27:01.048299+08	2026-02-14 13:32:05.557561+08
81	0762bdb8822c	Statistics	statistics	\N	2026-02-13 22:27:01.056293+08	2026-02-14 13:32:05.565302+08
77	eb5b8eb5cf63	Social Work	social-work	\N	2026-02-13 22:27:01.053988+08	2026-02-14 13:32:05.562911+08
83	3e5bcc2f75d2	Urban / Regional Planning	urban-regional-planning	\N	2026-02-13 22:27:01.057576+08	2026-02-14 13:32:05.566668+08
3	ea6d81885bd7	Agriculture	agriculture	\N	2026-02-13 22:27:01.004744+08	2026-02-14 13:32:05.520097+08
22	1ef4dd8ac0df	Earth Science	earth-science	\N	2026-02-13 22:27:01.018631+08	2026-02-14 13:32:05.532072+08
33	5f9ab2b8d932	Fine Arts	fine-arts	\N	2026-02-13 22:27:01.025858+08	2026-02-14 13:32:05.538298+08
15	b70879608589	Computer Engineering	computer-engineering	\N	2026-02-13 22:27:01.013372+08	2026-02-14 13:32:05.527729+08
23	47076402214e	Economics	economics	\N	2026-02-13 22:27:01.019446+08	2026-02-14 13:32:05.532826+08
37	971cb0ee2835	General Studies	general-studies	\N	2026-02-13 22:27:01.028213+08	2026-02-14 13:32:05.540557+08
39	6d21c595f9c8	Graphic Design	graphic-design	\N	2026-02-13 22:27:01.02949+08	2026-02-14 13:32:05.541645+08
41	d9e68467e7be	Hospitality / Tourism Management	hospitality-tourism-management	\N	2026-02-13 22:27:01.030832+08	2026-02-14 13:32:05.542903+08
61	4616a3c24570	Medical Technology / Laboratory Science	medical-technology-laboratory-science	\N	2026-02-13 22:27:01.043912+08	2026-02-14 13:32:05.553889+08
66	61b741e08336	Pharmacy	pharmacy	\N	2026-02-13 22:27:01.046949+08	2026-02-14 13:32:05.556435+08
1	15c27e8ca294	Accounting	accounting	\N	2026-02-13 22:27:01.002302+08	2026-02-14 13:32:05.518529+08
5	3733b639967d	Anthropology	anthropology	\N	2026-02-13 22:27:01.006149+08	2026-02-14 13:32:05.521142+08
10	9bf6fda8ac54	Business Administration	business-administration	\N	2026-02-13 22:27:01.009879+08	2026-02-14 13:32:05.524532+08
\.


--
-- Data for Name: community_bans; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_bans (id, community_id, target_uid, issued_by_uid, reason, active, created_at, lifted_at, lifted_by_uid) FROM stdin;
\.


--
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, uuid, title, description, filename, uploader_uid, uploaddate, course, subject, views, popularity, visibility, aiallowed, link, thumbnail_link) FROM stdin;
7	bf12b8a9-05a6-4e40-920c-fc646d71927c	Chase	dawdadadas	digital-signatures-and-web-security.pptx	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-10 23:15:30.036785+08	Cybersecurity	Signatures	0	0	public	f	library/1770736526782-f38eeb4ecbb3-digital-signatures-and-web-security.pptx	\N
8	78ca081e-6d47-422d-bfe8-54ec93849d4a	Second	dwasdwadw	BSCS.pdf	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-10 23:16:22.772056+08	Computer Science	Program	0	0	public	f	library/1770736580570-a6c45604051b-BSCS.pdf	\N
\.


--
-- Data for Name: community_posts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_posts (id, community_id, author_uid, title, content, visibility, status, taken_down_by_uid, taken_down_reason, created_at, updated_at, attachment_type, attachment_key, attachment_link, attachment_title, attachment_library_document_uuid, attachment_filename, attachment_mime_type, likes_count) FROM stdin;
1	16	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	Hello	Wazzuppppp	main_course_only	active	\N	\N	2026-02-13 22:40:31.589468+08	2026-02-13 22:56:34.595006+08	\N	\N	\N	\N	\N	\N	\N	1
\.


--
-- Data for Name: community_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_comments (id, community_id, post_id, author_uid, content, status, taken_down_by_uid, taken_down_reason, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: community_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_reports (id, community_id, reporter_uid, target_uid, target_type, target_post_id, target_comment_id, reason, status, resolution_note, resolved_by_uid, resolved_at, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: community_comment_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_comment_reports (id, report_id, community_id, comment_id, reporter_uid, reason, created_at) FROM stdin;
\.


--
-- Data for Name: community_memberships; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_memberships (id, community_id, user_uid, state, joined_at, left_at, banned_at, created_at, updated_at) FROM stdin;
1	84	45cd2fda-ece1-46ba-8e5b-7e91c296be46	member	2026-02-13 22:27:01.062174+08	\N	\N	2026-02-13 22:27:01.062174+08	2026-02-14 12:59:28.726635+08
139	16	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	member	2026-02-13 22:32:18.214268+08	\N	\N	2026-02-13 22:32:18.214268+08	2026-02-14 13:32:05.571081+08
7	16	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	member	2026-02-13 22:27:27.794889+08	\N	\N	2026-02-13 22:27:27.794889+08	2026-02-13 22:28:38.431788+08
491	38	5e10f635-f669-4da4-beba-848c29f4ce66	member	2026-02-14 11:47:16.70668+08	\N	\N	2026-02-14 11:47:16.70668+08	2026-02-14 11:47:16.70668+08
165	33	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	member	2026-02-13 22:44:26.953037+08	\N	\N	2026-02-13 22:43:58.22694+08	2026-02-13 22:44:26.953037+08
\.


--
-- Data for Name: community_post_likes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_post_likes (id, community_id, post_id, user_uid, created_at) FROM stdin;
2	16	1	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	2026-02-13 22:56:34.594329+08
\.


--
-- Data for Name: community_post_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_post_reports (id, report_id, community_id, post_id, reporter_uid, reason, created_at) FROM stdin;
\.


--
-- Data for Name: community_roles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_roles (id, community_id, user_uid, role, assigned_by_uid, created_at) FROM stdin;
\.


--
-- Data for Name: community_rule_acceptances; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_rule_acceptances (id, community_id, user_uid, version, accepted_at) FROM stdin;
\.


--
-- Data for Name: community_rules; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_rules (id, community_id, version, content, created_by_uid, created_at) FROM stdin;
\.


--
-- Data for Name: community_warnings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_warnings (id, community_id, target_uid, issued_by_uid, reason, created_at) FROM stdin;
1	33	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	45cd2fda-ece1-46ba-8e5b-7e91c296be46	Test	2026-02-13 22:45:24.498643+08
\.


--
-- Data for Name: courses; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.courses (id, course_code, course_name) FROM stdin;
1	ff67c64c62e3	Philosophy
2	271d54ff0289	History
3	9180a4e233ed	Literature
4	077ac2db842e	Languages
5	34f26d5ae7df	Linguistics
6	5f9ab2b8d932	Fine Arts
7	2e54b42c325e	Music
8	870b5ddf96c4	Theater / Drama
9	40551b31846d	Film / Media Arts
10	e5f1ecb0bc28	Religious Studies
11	c193e6fa844b	Sociology
12	3733b639967d	Anthropology
13	9608a98f01a0	Psychology
14	47076402214e	Economics
15	010f7e5430d6	Political Science
16	ef2f2e5bb636	International Relations
17	188f9ff0373b	Geography
18	78ee3db9d271	Criminology
19	eb5b8eb5cf63	Social Work
20	9bf6fda8ac54	Business Administration
21	293cb4366897	Management
22	15c27e8ca294	Accounting
23	abdba37fea96	Finance
24	8c376d92ab2d	Marketing
25	9a0eea425009	Entrepreneurship
26	d9e68467e7be	Hospitality / Tourism Management
27	e38017766343	Law
28	5cdece41acfe	Legal Studies
29	c58f21ad1242	Public Administration
30	5e3a1646dd1c	Education
31	2ee198e4dcd5	Elementary Education
32	7427c36f24a5	Secondary Education
33	97aead34ff06	Special Education
34	d6cbdfd737df	Early Childhood Education
35	702a54d073b2	Mathematics
36	0762bdb8822c	Statistics
37	e97d86e410c9	Physics
38	675f72510846	Chemistry
39	77d90a5a6295	Biology
40	b9b98aaba9af	Environmental Science
41	1ef4dd8ac0df	Earth Science
42	07d8a57b7ca6	Astronomy
43	a3e78381c7f8	Mechanical Engineering
44	8bfbeeabbc40	Electrical Engineering
45	1fad1af74935	Electronics Engineering
46	7cf1eca87035	Civil Engineering
47	e258c67a2d12	Chemical Engineering
48	07802b7bb80f	Industrial Engineering
49	b70879608589	Computer Engineering
50	bcb6ff934566	Environmental Engineering
51	45372655073c	Computer Science
52	fbe72222d27b	Information Technology
53	ee792df819cc	Information Systems
54	c48036bafbf8	Software Engineering
55	4f51ad614d59	Data Science
56	7aa9cdb3c7e4	Cybersecurity
57	cb5bb68af729	Medicine
58	bd87551f4a2f	Nursing
59	61b741e08336	Pharmacy
60	ca5c6b9fa611	Dentistry
61	76e6dbc11403	Public Health
62	4616a3c24570	Medical Technology / Laboratory Science
63	19df6e167d24	Nutrition & Dietetics
64	8c861ac6747f	Physical Therapy
65	ea6d81885bd7	Agriculture
66	757a4abe525b	Animal Science
67	a83da8c8dfc8	Forestry
68	ab2603a39d5d	Fisheries
69	d9e755436d60	Food Science
70	5b8f655402bb	Biotechnology
71	5d6aab399056	Architecture
72	3e5bcc2f75d2	Urban / Regional Planning
73	bba985ded2a6	Interior Design
74	6d21c595f9c8	Graphic Design
75	6c5535662012	Industrial Design
76	2c3a5b32d825	Communication Studies
77	99ff036fedc2	Journalism
78	e8919e420f3d	Mass Communication
79	2086e1e5001c	Public Relations
80	39bb7e5dabc6	Advertising
81	dbe3129fe055	Liberal Arts
82	971cb0ee2835	General Studies
83	67f427c81b64	Interdisciplinary Studies
\.


--
-- Data for Name: document_likes; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.document_likes (id, document_uuid, user_uid, created_at) FROM stdin;
\.


--
-- Data for Name: email_verification_tokens; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.email_verification_tokens (id, uid, token_digest, expires_at, created_at) FROM stdin;
1	5e10f635-f669-4da4-beba-848c29f4ce66	9e590bfa1bea587da1a06234b1166f4bd68ce2a87167652612397bad325dee5a	2026-02-15 11:47:16.551781+08	2026-02-14 11:47:16.551781+08
\.


--
-- Data for Name: follow_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.follow_requests (id, requester_uid, target_uid, status, created_at, updated_at) FROM stdin;
1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	accepted	2026-02-13 12:12:58.30578+08	2026-02-13 12:17:21.755666+08
2	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	45cd2fda-ece1-46ba-8e5b-7e91c296be46	accepted	2026-02-13 12:17:29.306015+08	2026-02-13 12:19:28.207938+08
6	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	45cd2fda-ece1-46ba-8e5b-7e91c296be46	accepted	2026-02-13 12:33:34.666977+08	2026-02-13 21:34:17.673253+08
7	45cd2fda-ece1-46ba-8e5b-7e91c296be46	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	accepted	2026-02-13 21:34:53.833362+08	2026-02-13 21:38:27.680696+08
8	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	45cd2fda-ece1-46ba-8e5b-7e91c296be46	accepted	2026-02-14 12:05:19.268649+08	2026-02-14 12:05:59.445249+08
\.


--
-- Data for Name: follows; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.follows (id, follower_uid, target_uid, created_at) FROM stdin;
1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	2026-02-13 12:17:21.755666+08
2	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-13 12:19:28.207938+08
3	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-13 21:34:17.673253+08
4	45cd2fda-ece1-46ba-8e5b-7e91c296be46	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	2026-02-13 21:38:27.680696+08
5	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-14 12:05:59.445249+08
\.


--
-- Data for Name: hidden_post_authors; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.hidden_post_authors (id, user_uid, hidden_uid, created_at) FROM stdin;
\.


--
-- Data for Name: profiles; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.profiles (id, uid, display_name, bio, main_course, sub_courses, facebook, linkedin, instagram, github, portfolio, photo_link, created_at, updated_at) FROM stdin;
2	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	Mark Lester Ambida	\N	Computer Science	\N	\N	\N	\N	\N	\N	\N	2026-02-13 12:03:07.291008+08	2026-02-13 12:03:07.291008+08
1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	Mark Lester	Computer Science student | Web Developer | AI Engineer	Computer Science	{Biology}			sunlightblues_	araume		profiles/1770730607012-cd97577ec34b-Screenshot_from_2026-02-09_11-56-29.png	2026-02-09 11:53:05.394594+08	2026-02-14 12:51:58.943038+08
3	6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	YaoYao		Fine Arts	{}						profiles/1770957160132-5d19dc23d66c-Screenshot_from_2026-02-13_12-30-21.png	2026-02-13 12:32:19.240025+08	2026-02-14 12:59:55.352168+08
4	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	Substack		Computer Science	{}						profiles/1771047060340-efd9c2b2e356-Screenshot_from_2026-02-03_20-00-10.png	2026-02-13 22:32:18.294394+08	2026-02-14 13:31:06.251804+08
\.


--
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rooms (id, meet_id, meet_name, creator_uid, visibility, community_id, course_name, max_participants, allow_mic, allow_video, allow_screen_share, password_hash, state, scheduled_at, started_at, ended_at, source_request_id, created_at, updated_at) FROM stdin;
1	CKQVCYGQ	DSA	45cd2fda-ece1-46ba-8e5b-7e91c296be46	public	\N	\N	25	t	t	f	\N	ended	\N	2026-02-14 00:57:35.832+08	2026-02-14 10:43:26.901429+08	\N	2026-02-14 00:57:35.83118+08	2026-02-14 10:43:26.901429+08
35	QRKTU3AE	Data Structures	45cd2fda-ece1-46ba-8e5b-7e91c296be46	public	16	Computer Science	25	t	t	f	\N	ended	\N	2026-02-14 11:04:06.703+08	2026-02-14 11:16:24.456993+08	\N	2026-02-14 11:04:06.702166+08	2026-02-14 11:16:24.456993+08
36	S8ST9RZJ	kwqabjkawnj-dca	45cd2fda-ece1-46ba-8e5b-7e91c296be46	public	\N	\N	25	t	t	f	\N	ended	\N	2026-02-14 11:16:49.584+08	2026-02-14 11:17:38.334163+08	\N	2026-02-14 11:16:49.582742+08	2026-02-14 11:17:38.334163+08
2	HDD7QB8D	Test	45cd2fda-ece1-46ba-8e5b-7e91c296be46	course_exclusive	16	Computer Science	25	t	t	f	\N	ended	\N	2026-02-14 10:50:42.114+08	2026-02-14 12:58:59.838107+08	\N	2026-02-14 10:50:42.111569+08	2026-02-14 12:58:59.838107+08
\.


--
-- Data for Name: room_chat_messages; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.room_chat_messages (id, room_id, sender_uid, body, created_at) FROM stdin;
\.


--
-- Data for Name: room_invites; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.room_invites (id, room_id, token_digest, created_by_uid, expires_at, revoked_at, created_at) FROM stdin;
\.


--
-- Data for Name: room_moderation_events; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.room_moderation_events (id, room_id, actor_uid, target_uid, action, meta, created_at) FROM stdin;
1	1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	create_room	{"state": "live", "visibility": "public"}	2026-02-14 00:57:35.83118+08
2	1	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	end_room	{}	2026-02-14 10:43:26.902075+08
3	2	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	create_room	{"state": "live", "visibility": "course_exclusive"}	2026-02-14 10:50:42.111569+08
36	35	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	create_room	{"state": "live", "visibility": "public"}	2026-02-14 11:04:06.702166+08
37	35	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	end_room	{}	2026-02-14 11:16:24.457851+08
38	36	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	create_room	{"state": "live", "visibility": "public"}	2026-02-14 11:16:49.582742+08
39	36	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	end_room	{}	2026-02-14 11:17:38.335102+08
40	2	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	end_room	{}	2026-02-14 12:58:59.839007+08
\.


--
-- Data for Name: room_participants; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.room_participants (id, room_id, user_uid, role, status, mic_on, video_on, screen_sharing, joined_at, left_at) FROM stdin;
1	2	45cd2fda-ece1-46ba-8e5b-7e91c296be46	host	active	t	t	f	2026-02-14 10:50:51.31089+08	\N
34	35	45cd2fda-ece1-46ba-8e5b-7e91c296be46	host	active	t	t	f	2026-02-14 11:04:11.853396+08	\N
37	36	45cd2fda-ece1-46ba-8e5b-7e91c296be46	host	active	t	t	f	2026-02-14 11:16:49.678336+08	\N
\.


--
-- Data for Name: room_requests; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.room_requests (id, requester_uid, meet_name, visibility, community_id, course_name, max_participants, allow_mic, allow_video, allow_screen_share, password_hash, scheduled_at, status, expires_at, reviewed_by_uid, reviewed_at, decision_note, approved_room_id, created_at, updated_at) FROM stdin;
\.


--
-- Data for Name: user_presence; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_presence (uid, last_active_at, updated_at) FROM stdin;
45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-14 12:59:22.687207+08	2026-02-14 12:59:22.687207+08
6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	2026-02-14 12:59:44.535131+08	2026-02-14 12:59:44.535131+08
614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	2026-02-14 13:31:51.569143+08	2026-02-14 13:31:51.569143+08
6ca79bfd-0cb0-4aa1-be02-16ab659fadff	2026-02-14 12:05:47.659233+08	2026-02-14 12:05:47.659233+08
\.


--
-- Data for Name: user_privacy_settings; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_privacy_settings (uid, searchable, follow_approval_required, non_follower_chat_policy, active_visible, created_at, updated_at) FROM stdin;
6ca79bfd-0cb0-4aa1-be02-16ab659fadff	t	t	request	t	2026-02-13 12:03:12.014125+08	2026-02-13 12:03:12.014125+08
6d68d23c-9b0f-4139-9e8c-b13e3c8eccbc	t	t	request	t	2026-02-13 12:32:30.296337+08	2026-02-13 12:32:30.296337+08
614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	t	t	request	t	2026-02-13 22:45:42.81718+08	2026-02-13 22:45:42.81718+08
45cd2fda-ece1-46ba-8e5b-7e91c296be46	t	t	request	t	2026-02-13 03:54:41.109755+08	2026-02-14 12:04:51.629088+08
\.


--
-- Data for Name: user_profile_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.user_profile_reports (id, reporter_uid, target_uid, reason, created_at) FROM stdin;
\.


--
-- Name: accounts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.accounts_id_seq', 5, true);


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.admin_audit_logs_id_seq', 2, true);


--
-- Name: blocked_users_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.blocked_users_id_seq', 1, false);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chat_messages_id_seq', 2, true);


--
-- Name: chat_participants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chat_participants_id_seq', 4, true);


--
-- Name: chat_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chat_requests_id_seq', 3, true);


--
-- Name: chat_threads_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.chat_threads_id_seq', 2, true);


--
-- Name: communities_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.communities_id_seq', 42678, true);


--
-- Name: community_bans_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_bans_id_seq', 1, false);


--
-- Name: community_comment_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_comment_reports_id_seq', 1, false);


--
-- Name: community_comments_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_comments_id_seq', 1, false);


--
-- Name: community_memberships_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_memberships_id_seq', 524, true);


--
-- Name: community_post_likes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_post_likes_id_seq', 2, true);


--
-- Name: community_post_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_post_reports_id_seq', 1, false);


--
-- Name: community_posts_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_posts_id_seq', 1, true);


--
-- Name: community_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_reports_id_seq', 1, false);


--
-- Name: community_roles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_roles_id_seq', 1, false);


--
-- Name: community_rule_acceptances_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_rule_acceptances_id_seq', 1, false);


--
-- Name: community_rules_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_rules_id_seq', 1, false);


--
-- Name: community_warnings_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.community_warnings_id_seq', 1, true);


--
-- Name: courses_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.courses_id_seq', 83, true);


--
-- Name: document_likes_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.document_likes_id_seq', 4, true);


--
-- Name: documents_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.documents_id_seq', 8, true);


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.email_verification_tokens_id_seq', 1, true);


--
-- Name: follow_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.follow_requests_id_seq', 8, true);


--
-- Name: follows_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.follows_id_seq', 5, true);


--
-- Name: hidden_post_authors_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.hidden_post_authors_id_seq', 1, false);


--
-- Name: profiles_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.profiles_id_seq', 4, true);


--
-- Name: room_chat_messages_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.room_chat_messages_id_seq', 1, false);


--
-- Name: room_invites_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.room_invites_id_seq', 1, false);


--
-- Name: room_moderation_events_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.room_moderation_events_id_seq', 40, true);


--
-- Name: room_participants_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.room_participants_id_seq', 37, true);


--
-- Name: room_requests_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.room_requests_id_seq', 1, false);


--
-- Name: rooms_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.rooms_id_seq', 36, true);


--
-- Name: user_profile_reports_id_seq; Type: SEQUENCE SET; Schema: public; Owner: -
--

SELECT pg_catalog.setval('public.user_profile_reports_id_seq', 1, false);


--
-- PostgreSQL database dump complete
--

\unrestrict AXZstk3Dk5Wx1obf8jAV5blUKXKj6J7QS37msyVqVXb94Ixgz5cDd7pFMnKdIQk

