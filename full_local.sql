--
-- PostgreSQL database dump
--

\restrict BwMriCZSpt1pYq6PVR8dJJTgqx63DPhNPyavEhwQdLLuiFmga9210OdjgRq3Yu6

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

ALTER TABLE IF EXISTS ONLY public.user_profile_reports DROP CONSTRAINT IF EXISTS user_profile_reports_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.user_profile_reports DROP CONSTRAINT IF EXISTS user_profile_reports_reporter_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.user_privacy_settings DROP CONSTRAINT IF EXISTS user_privacy_settings_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.user_presence DROP CONSTRAINT IF EXISTS user_presence_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.rooms DROP CONSTRAINT IF EXISTS rooms_creator_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.rooms DROP CONSTRAINT IF EXISTS rooms_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.room_requests DROP CONSTRAINT IF EXISTS room_requests_reviewed_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_requests DROP CONSTRAINT IF EXISTS room_requests_requester_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_requests DROP CONSTRAINT IF EXISTS room_requests_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.room_requests DROP CONSTRAINT IF EXISTS room_requests_approved_room_id_fkey;
ALTER TABLE IF EXISTS ONLY public.room_participants DROP CONSTRAINT IF EXISTS room_participants_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_participants DROP CONSTRAINT IF EXISTS room_participants_room_id_fkey;
ALTER TABLE IF EXISTS ONLY public.room_moderation_events DROP CONSTRAINT IF EXISTS room_moderation_events_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_moderation_events DROP CONSTRAINT IF EXISTS room_moderation_events_room_id_fkey;
ALTER TABLE IF EXISTS ONLY public.room_moderation_events DROP CONSTRAINT IF EXISTS room_moderation_events_actor_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_invites DROP CONSTRAINT IF EXISTS room_invites_room_id_fkey;
ALTER TABLE IF EXISTS ONLY public.room_invites DROP CONSTRAINT IF EXISTS room_invites_created_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_chat_messages DROP CONSTRAINT IF EXISTS room_chat_messages_sender_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.room_chat_messages DROP CONSTRAINT IF EXISTS room_chat_messages_room_id_fkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.hidden_post_authors DROP CONSTRAINT IF EXISTS hidden_post_authors_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.hidden_post_authors DROP CONSTRAINT IF EXISTS hidden_post_authors_hidden_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS follows_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS follows_follower_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.follow_requests DROP CONSTRAINT IF EXISTS follow_requests_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.follow_requests DROP CONSTRAINT IF EXISTS follow_requests_requester_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_tokens_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_uploader_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.document_likes DROP CONSTRAINT IF EXISTS document_likes_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.document_likes DROP CONSTRAINT IF EXISTS document_likes_document_uuid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_warnings DROP CONSTRAINT IF EXISTS community_warnings_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_warnings DROP CONSTRAINT IF EXISTS community_warnings_issued_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_warnings DROP CONSTRAINT IF EXISTS community_warnings_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_rules DROP CONSTRAINT IF EXISTS community_rules_created_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_rules DROP CONSTRAINT IF EXISTS community_rules_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_rule_acceptances DROP CONSTRAINT IF EXISTS community_rule_acceptances_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_rule_acceptances DROP CONSTRAINT IF EXISTS community_rule_acceptances_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_roles DROP CONSTRAINT IF EXISTS community_roles_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_roles DROP CONSTRAINT IF EXISTS community_roles_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_roles DROP CONSTRAINT IF EXISTS community_roles_assigned_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_target_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_target_comment_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_resolved_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_reporter_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_posts DROP CONSTRAINT IF EXISTS community_posts_taken_down_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_posts DROP CONSTRAINT IF EXISTS community_posts_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_posts DROP CONSTRAINT IF EXISTS community_posts_author_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_posts DROP CONSTRAINT IF EXISTS community_posts_attachment_library_document_uuid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_reports DROP CONSTRAINT IF EXISTS community_post_reports_reporter_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_reports DROP CONSTRAINT IF EXISTS community_post_reports_report_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_reports DROP CONSTRAINT IF EXISTS community_post_reports_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_reports DROP CONSTRAINT IF EXISTS community_post_reports_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_likes DROP CONSTRAINT IF EXISTS community_post_likes_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_likes DROP CONSTRAINT IF EXISTS community_post_likes_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_post_likes DROP CONSTRAINT IF EXISTS community_post_likes_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_memberships DROP CONSTRAINT IF EXISTS community_memberships_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_memberships DROP CONSTRAINT IF EXISTS community_memberships_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comments DROP CONSTRAINT IF EXISTS community_comments_taken_down_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comments DROP CONSTRAINT IF EXISTS community_comments_post_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comments DROP CONSTRAINT IF EXISTS community_comments_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comments DROP CONSTRAINT IF EXISTS community_comments_author_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comment_reports DROP CONSTRAINT IF EXISTS community_comment_reports_reporter_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comment_reports DROP CONSTRAINT IF EXISTS community_comment_reports_report_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comment_reports DROP CONSTRAINT IF EXISTS community_comment_reports_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_comment_reports DROP CONSTRAINT IF EXISTS community_comment_reports_comment_id_fkey;
ALTER TABLE IF EXISTS ONLY public.community_bans DROP CONSTRAINT IF EXISTS community_bans_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_bans DROP CONSTRAINT IF EXISTS community_bans_lifted_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_bans DROP CONSTRAINT IF EXISTS community_bans_issued_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.community_bans DROP CONSTRAINT IF EXISTS community_bans_community_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_created_by_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_requests DROP CONSTRAINT IF EXISTS chat_requests_target_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_requests DROP CONSTRAINT IF EXISTS chat_requests_requester_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_participants DROP CONSTRAINT IF EXISTS chat_participants_user_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_participants DROP CONSTRAINT IF EXISTS chat_participants_thread_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_thread_id_fkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_sender_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.blocked_users DROP CONSTRAINT IF EXISTS blocked_users_blocker_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.blocked_users DROP CONSTRAINT IF EXISTS blocked_users_blocked_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_executor_uid_fkey;
ALTER TABLE IF EXISTS ONLY public.accounts DROP CONSTRAINT IF EXISTS accounts_banned_by_uid_fkey;
DROP INDEX IF EXISTS public.user_profile_reports_target_idx;
DROP INDEX IF EXISTS public.rooms_visibility_created_idx;
DROP INDEX IF EXISTS public.rooms_state_scheduled_idx;
DROP INDEX IF EXISTS public.rooms_creator_created_idx;
DROP INDEX IF EXISTS public.rooms_community_created_idx;
DROP INDEX IF EXISTS public.room_requests_status_expires_idx;
DROP INDEX IF EXISTS public.room_requests_requester_status_idx;
DROP INDEX IF EXISTS public.room_requests_community_status_idx;
DROP INDEX IF EXISTS public.room_participants_room_status_idx;
DROP INDEX IF EXISTS public.room_moderation_events_room_created_idx;
DROP INDEX IF EXISTS public.room_invites_room_expires_idx;
DROP INDEX IF EXISTS public.room_chat_messages_room_created_idx;
DROP INDEX IF EXISTS public.profiles_display_name_lower_idx;
DROP INDEX IF EXISTS public.hidden_post_authors_user_idx;
DROP INDEX IF EXISTS public.hidden_post_authors_hidden_idx;
DROP INDEX IF EXISTS public.follows_target_idx;
DROP INDEX IF EXISTS public.follows_follower_idx;
DROP INDEX IF EXISTS public.follow_requests_target_status_idx;
DROP INDEX IF EXISTS public.follow_requests_requester_status_idx;
DROP INDEX IF EXISTS public.email_verification_tokens_uid_idx;
DROP INDEX IF EXISTS public.email_verification_tokens_expires_idx;
DROP INDEX IF EXISTS public.documents_views_idx;
DROP INDEX IF EXISTS public.documents_uploaddate_idx;
DROP INDEX IF EXISTS public.documents_popularity_idx;
DROP INDEX IF EXISTS public.documents_course_idx;
DROP INDEX IF EXISTS public.community_roles_community_role_idx;
DROP INDEX IF EXISTS public.community_reports_community_status_idx;
DROP INDEX IF EXISTS public.community_posts_community_likes_idx;
DROP INDEX IF EXISTS public.community_posts_community_created_idx;
DROP INDEX IF EXISTS public.community_post_reports_post_idx;
DROP INDEX IF EXISTS public.community_post_reports_community_idx;
DROP INDEX IF EXISTS public.community_post_likes_user_idx;
DROP INDEX IF EXISTS public.community_post_likes_post_idx;
DROP INDEX IF EXISTS public.community_memberships_user_state_idx;
DROP INDEX IF EXISTS public.community_memberships_community_state_idx;
DROP INDEX IF EXISTS public.community_comments_post_created_idx;
DROP INDEX IF EXISTS public.community_comment_reports_community_idx;
DROP INDEX IF EXISTS public.community_comment_reports_comment_idx;
DROP INDEX IF EXISTS public.communities_course_name_idx;
DROP INDEX IF EXISTS public.chat_requests_target_status_idx;
DROP INDEX IF EXISTS public.chat_requests_requester_status_idx;
DROP INDEX IF EXISTS public.chat_participants_user_status_idx;
DROP INDEX IF EXISTS public.chat_participants_thread_status_idx;
DROP INDEX IF EXISTS public.chat_messages_thread_created_idx;
DROP INDEX IF EXISTS public.blocked_users_blocker_idx;
DROP INDEX IF EXISTS public.blocked_users_blocked_idx;
DROP INDEX IF EXISTS public.admin_audit_logs_executor_idx;
DROP INDEX IF EXISTS public.admin_audit_logs_created_idx;
DROP INDEX IF EXISTS public.admin_audit_logs_course_idx;
DROP INDEX IF EXISTS public.admin_audit_logs_action_idx;
DROP INDEX IF EXISTS public.accounts_uid_unique_idx;
DROP INDEX IF EXISTS public.accounts_uid_text_idx;
DROP INDEX IF EXISTS public.accounts_display_name_lower_idx;
ALTER TABLE IF EXISTS ONLY public.user_profile_reports DROP CONSTRAINT IF EXISTS user_profile_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.user_privacy_settings DROP CONSTRAINT IF EXISTS user_privacy_settings_pkey;
ALTER TABLE IF EXISTS ONLY public.user_presence DROP CONSTRAINT IF EXISTS user_presence_pkey;
ALTER TABLE IF EXISTS ONLY public.rooms DROP CONSTRAINT IF EXISTS rooms_pkey;
ALTER TABLE IF EXISTS ONLY public.rooms DROP CONSTRAINT IF EXISTS rooms_meet_id_key;
ALTER TABLE IF EXISTS ONLY public.room_requests DROP CONSTRAINT IF EXISTS room_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.room_participants DROP CONSTRAINT IF EXISTS room_participants_room_id_user_uid_key;
ALTER TABLE IF EXISTS ONLY public.room_participants DROP CONSTRAINT IF EXISTS room_participants_pkey;
ALTER TABLE IF EXISTS ONLY public.room_moderation_events DROP CONSTRAINT IF EXISTS room_moderation_events_pkey;
ALTER TABLE IF EXISTS ONLY public.room_invites DROP CONSTRAINT IF EXISTS room_invites_token_digest_key;
ALTER TABLE IF EXISTS ONLY public.room_invites DROP CONSTRAINT IF EXISTS room_invites_pkey;
ALTER TABLE IF EXISTS ONLY public.room_chat_messages DROP CONSTRAINT IF EXISTS room_chat_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_uid_key;
ALTER TABLE IF EXISTS ONLY public.profiles DROP CONSTRAINT IF EXISTS profiles_pkey;
ALTER TABLE IF EXISTS ONLY public.hidden_post_authors DROP CONSTRAINT IF EXISTS hidden_post_authors_user_uid_hidden_uid_key;
ALTER TABLE IF EXISTS ONLY public.hidden_post_authors DROP CONSTRAINT IF EXISTS hidden_post_authors_pkey;
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS follows_pkey;
ALTER TABLE IF EXISTS ONLY public.follows DROP CONSTRAINT IF EXISTS follows_follower_uid_target_uid_key;
ALTER TABLE IF EXISTS ONLY public.follow_requests DROP CONSTRAINT IF EXISTS follow_requests_requester_uid_target_uid_key;
ALTER TABLE IF EXISTS ONLY public.follow_requests DROP CONSTRAINT IF EXISTS follow_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_tokens_uid_key;
ALTER TABLE IF EXISTS ONLY public.email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_tokens_token_digest_key;
ALTER TABLE IF EXISTS ONLY public.email_verification_tokens DROP CONSTRAINT IF EXISTS email_verification_tokens_pkey;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_uuid_key;
ALTER TABLE IF EXISTS ONLY public.documents DROP CONSTRAINT IF EXISTS documents_pkey;
ALTER TABLE IF EXISTS ONLY public.document_likes DROP CONSTRAINT IF EXISTS document_likes_pkey;
ALTER TABLE IF EXISTS ONLY public.document_likes DROP CONSTRAINT IF EXISTS document_likes_document_uuid_user_uid_key;
ALTER TABLE IF EXISTS ONLY public.courses DROP CONSTRAINT IF EXISTS courses_pkey;
ALTER TABLE IF EXISTS ONLY public.courses DROP CONSTRAINT IF EXISTS courses_course_code_key;
ALTER TABLE IF EXISTS ONLY public.community_warnings DROP CONSTRAINT IF EXISTS community_warnings_pkey;
ALTER TABLE IF EXISTS ONLY public.community_rules DROP CONSTRAINT IF EXISTS community_rules_pkey;
ALTER TABLE IF EXISTS ONLY public.community_rules DROP CONSTRAINT IF EXISTS community_rules_community_id_version_key;
ALTER TABLE IF EXISTS ONLY public.community_rule_acceptances DROP CONSTRAINT IF EXISTS community_rule_acceptances_pkey;
ALTER TABLE IF EXISTS ONLY public.community_rule_acceptances DROP CONSTRAINT IF EXISTS community_rule_acceptances_community_id_user_uid_version_key;
ALTER TABLE IF EXISTS ONLY public.community_roles DROP CONSTRAINT IF EXISTS community_roles_pkey;
ALTER TABLE IF EXISTS ONLY public.community_roles DROP CONSTRAINT IF EXISTS community_roles_community_id_user_uid_role_key;
ALTER TABLE IF EXISTS ONLY public.community_reports DROP CONSTRAINT IF EXISTS community_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.community_posts DROP CONSTRAINT IF EXISTS community_posts_pkey;
ALTER TABLE IF EXISTS ONLY public.community_post_reports DROP CONSTRAINT IF EXISTS community_post_reports_report_id_key;
ALTER TABLE IF EXISTS ONLY public.community_post_reports DROP CONSTRAINT IF EXISTS community_post_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.community_post_likes DROP CONSTRAINT IF EXISTS community_post_likes_pkey;
ALTER TABLE IF EXISTS ONLY public.community_post_likes DROP CONSTRAINT IF EXISTS community_post_likes_community_id_post_id_user_uid_key;
ALTER TABLE IF EXISTS ONLY public.community_memberships DROP CONSTRAINT IF EXISTS community_memberships_pkey;
ALTER TABLE IF EXISTS ONLY public.community_memberships DROP CONSTRAINT IF EXISTS community_memberships_community_id_user_uid_key;
ALTER TABLE IF EXISTS ONLY public.community_comments DROP CONSTRAINT IF EXISTS community_comments_pkey;
ALTER TABLE IF EXISTS ONLY public.community_comment_reports DROP CONSTRAINT IF EXISTS community_comment_reports_report_id_key;
ALTER TABLE IF EXISTS ONLY public.community_comment_reports DROP CONSTRAINT IF EXISTS community_comment_reports_pkey;
ALTER TABLE IF EXISTS ONLY public.community_bans DROP CONSTRAINT IF EXISTS community_bans_pkey;
ALTER TABLE IF EXISTS ONLY public.communities DROP CONSTRAINT IF EXISTS communities_slug_key;
ALTER TABLE IF EXISTS ONLY public.communities DROP CONSTRAINT IF EXISTS communities_pkey;
ALTER TABLE IF EXISTS ONLY public.communities DROP CONSTRAINT IF EXISTS communities_course_name_key;
ALTER TABLE IF EXISTS ONLY public.communities DROP CONSTRAINT IF EXISTS communities_course_code_key;
ALTER TABLE IF EXISTS ONLY public.chat_threads DROP CONSTRAINT IF EXISTS chat_threads_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_requests DROP CONSTRAINT IF EXISTS chat_requests_requester_uid_target_uid_key;
ALTER TABLE IF EXISTS ONLY public.chat_requests DROP CONSTRAINT IF EXISTS chat_requests_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_participants DROP CONSTRAINT IF EXISTS chat_participants_thread_id_user_uid_key;
ALTER TABLE IF EXISTS ONLY public.chat_participants DROP CONSTRAINT IF EXISTS chat_participants_pkey;
ALTER TABLE IF EXISTS ONLY public.chat_messages DROP CONSTRAINT IF EXISTS chat_messages_pkey;
ALTER TABLE IF EXISTS ONLY public.blocked_users DROP CONSTRAINT IF EXISTS blocked_users_pkey;
ALTER TABLE IF EXISTS ONLY public.blocked_users DROP CONSTRAINT IF EXISTS blocked_users_blocker_uid_blocked_uid_key;
ALTER TABLE IF EXISTS ONLY public.auth_schema_meta DROP CONSTRAINT IF EXISTS auth_schema_meta_pkey;
ALTER TABLE IF EXISTS ONLY public.admin_audit_logs DROP CONSTRAINT IF EXISTS admin_audit_logs_pkey;
ALTER TABLE IF EXISTS ONLY public.accounts DROP CONSTRAINT IF EXISTS accounts_pkey;
ALTER TABLE IF EXISTS ONLY public.accounts DROP CONSTRAINT IF EXISTS accounts_email_key;
ALTER TABLE IF EXISTS public.user_profile_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.rooms ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.room_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.room_participants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.room_moderation_events ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.room_invites ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.room_chat_messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.profiles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.hidden_post_authors ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.follows ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.follow_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.email_verification_tokens ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.documents ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.document_likes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.courses ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_warnings ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_rules ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_rule_acceptances ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_roles ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_posts ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_post_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_post_likes ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_memberships ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_comments ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_comment_reports ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.community_bans ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.communities ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chat_threads ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chat_requests ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chat_participants ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.chat_messages ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.blocked_users ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.admin_audit_logs ALTER COLUMN id DROP DEFAULT;
ALTER TABLE IF EXISTS public.accounts ALTER COLUMN id DROP DEFAULT;
DROP SEQUENCE IF EXISTS public.user_profile_reports_id_seq;
DROP TABLE IF EXISTS public.user_profile_reports;
DROP TABLE IF EXISTS public.user_privacy_settings;
DROP TABLE IF EXISTS public.user_presence;
DROP SEQUENCE IF EXISTS public.rooms_id_seq;
DROP TABLE IF EXISTS public.rooms;
DROP SEQUENCE IF EXISTS public.room_requests_id_seq;
DROP TABLE IF EXISTS public.room_requests;
DROP SEQUENCE IF EXISTS public.room_participants_id_seq;
DROP TABLE IF EXISTS public.room_participants;
DROP SEQUENCE IF EXISTS public.room_moderation_events_id_seq;
DROP TABLE IF EXISTS public.room_moderation_events;
DROP SEQUENCE IF EXISTS public.room_invites_id_seq;
DROP TABLE IF EXISTS public.room_invites;
DROP SEQUENCE IF EXISTS public.room_chat_messages_id_seq;
DROP TABLE IF EXISTS public.room_chat_messages;
DROP SEQUENCE IF EXISTS public.profiles_id_seq;
DROP TABLE IF EXISTS public.profiles;
DROP SEQUENCE IF EXISTS public.hidden_post_authors_id_seq;
DROP TABLE IF EXISTS public.hidden_post_authors;
DROP SEQUENCE IF EXISTS public.follows_id_seq;
DROP TABLE IF EXISTS public.follows;
DROP SEQUENCE IF EXISTS public.follow_requests_id_seq;
DROP TABLE IF EXISTS public.follow_requests;
DROP SEQUENCE IF EXISTS public.email_verification_tokens_id_seq;
DROP TABLE IF EXISTS public.email_verification_tokens;
DROP SEQUENCE IF EXISTS public.documents_id_seq;
DROP TABLE IF EXISTS public.documents;
DROP SEQUENCE IF EXISTS public.document_likes_id_seq;
DROP TABLE IF EXISTS public.document_likes;
DROP SEQUENCE IF EXISTS public.courses_id_seq;
DROP TABLE IF EXISTS public.courses;
DROP SEQUENCE IF EXISTS public.community_warnings_id_seq;
DROP TABLE IF EXISTS public.community_warnings;
DROP SEQUENCE IF EXISTS public.community_rules_id_seq;
DROP TABLE IF EXISTS public.community_rules;
DROP SEQUENCE IF EXISTS public.community_rule_acceptances_id_seq;
DROP TABLE IF EXISTS public.community_rule_acceptances;
DROP SEQUENCE IF EXISTS public.community_roles_id_seq;
DROP TABLE IF EXISTS public.community_roles;
DROP SEQUENCE IF EXISTS public.community_reports_id_seq;
DROP TABLE IF EXISTS public.community_reports;
DROP SEQUENCE IF EXISTS public.community_posts_id_seq;
DROP TABLE IF EXISTS public.community_posts;
DROP SEQUENCE IF EXISTS public.community_post_reports_id_seq;
DROP TABLE IF EXISTS public.community_post_reports;
DROP SEQUENCE IF EXISTS public.community_post_likes_id_seq;
DROP TABLE IF EXISTS public.community_post_likes;
DROP SEQUENCE IF EXISTS public.community_memberships_id_seq;
DROP TABLE IF EXISTS public.community_memberships;
DROP SEQUENCE IF EXISTS public.community_comments_id_seq;
DROP TABLE IF EXISTS public.community_comments;
DROP SEQUENCE IF EXISTS public.community_comment_reports_id_seq;
DROP TABLE IF EXISTS public.community_comment_reports;
DROP SEQUENCE IF EXISTS public.community_bans_id_seq;
DROP TABLE IF EXISTS public.community_bans;
DROP SEQUENCE IF EXISTS public.communities_id_seq;
DROP TABLE IF EXISTS public.communities;
DROP SEQUENCE IF EXISTS public.chat_threads_id_seq;
DROP TABLE IF EXISTS public.chat_threads;
DROP SEQUENCE IF EXISTS public.chat_requests_id_seq;
DROP TABLE IF EXISTS public.chat_requests;
DROP SEQUENCE IF EXISTS public.chat_participants_id_seq;
DROP TABLE IF EXISTS public.chat_participants;
DROP SEQUENCE IF EXISTS public.chat_messages_id_seq;
DROP TABLE IF EXISTS public.chat_messages;
DROP SEQUENCE IF EXISTS public.blocked_users_id_seq;
DROP TABLE IF EXISTS public.blocked_users;
DROP TABLE IF EXISTS public.auth_schema_meta;
DROP SEQUENCE IF EXISTS public.admin_audit_logs_id_seq;
DROP TABLE IF EXISTS public.admin_audit_logs;
DROP SEQUENCE IF EXISTS public.accounts_id_seq;
DROP TABLE IF EXISTS public.accounts;
DROP EXTENSION IF EXISTS pgcrypto;
--
-- Name: pgcrypto; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;


--
-- Name: EXTENSION pgcrypto; Type: COMMENT; Schema: -; Owner: -
--

COMMENT ON EXTENSION pgcrypto IS 'cryptographic functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: accounts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.accounts (
    id integer NOT NULL,
    email text NOT NULL,
    uid text NOT NULL,
    password text NOT NULL,
    username text,
    display_name text,
    course text,
    recovery_email text,
    datecreated timestamp with time zone DEFAULT now() NOT NULL,
    platform_role text DEFAULT 'member'::text NOT NULL,
    email_verified boolean DEFAULT false NOT NULL,
    email_verified_at timestamp with time zone,
    is_banned boolean DEFAULT false NOT NULL,
    banned_at timestamp with time zone,
    banned_reason text,
    banned_by_uid text
);


--
-- Name: accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.accounts_id_seq OWNED BY public.accounts.id;


--
-- Name: admin_audit_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_audit_logs (
    id bigint NOT NULL,
    executor_uid text,
    executor_role text,
    action_key text NOT NULL,
    action_type text NOT NULL,
    target_type text,
    target_id text,
    course text,
    source_path text,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_audit_logs_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_audit_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_audit_logs_id_seq OWNED BY public.admin_audit_logs.id;


--
-- Name: auth_schema_meta; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.auth_schema_meta (
    key text NOT NULL,
    value text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: blocked_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.blocked_users (
    id bigint NOT NULL,
    blocker_uid text NOT NULL,
    blocked_uid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT blocked_users_check CHECK ((blocker_uid <> blocked_uid))
);


--
-- Name: blocked_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.blocked_users_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: blocked_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.blocked_users_id_seq OWNED BY public.blocked_users.id;


--
-- Name: chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_messages (
    id bigint NOT NULL,
    thread_id bigint NOT NULL,
    sender_uid text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_messages_id_seq OWNED BY public.chat_messages.id;


--
-- Name: chat_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_participants (
    id bigint NOT NULL,
    thread_id bigint NOT NULL,
    user_uid text NOT NULL,
    role text DEFAULT 'member'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    CONSTRAINT chat_participants_role_check CHECK ((role = ANY (ARRAY['owner'::text, 'member'::text]))),
    CONSTRAINT chat_participants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'left'::text, 'pending'::text, 'declined'::text])))
);


--
-- Name: chat_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_participants_id_seq OWNED BY public.chat_participants.id;


--
-- Name: chat_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_requests (
    id bigint NOT NULL,
    requester_uid text NOT NULL,
    target_uid text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_requests_check CHECK ((requester_uid <> target_uid)),
    CONSTRAINT chat_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'canceled'::text])))
);


--
-- Name: chat_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_requests_id_seq OWNED BY public.chat_requests.id;


--
-- Name: chat_threads; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.chat_threads (
    id bigint NOT NULL,
    thread_type text NOT NULL,
    created_by_uid text NOT NULL,
    title text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT chat_threads_thread_type_check CHECK ((thread_type = ANY (ARRAY['direct'::text, 'group'::text])))
);


--
-- Name: chat_threads_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.chat_threads_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: chat_threads_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.chat_threads_id_seq OWNED BY public.chat_threads.id;


--
-- Name: communities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.communities (
    id integer NOT NULL,
    course_code text,
    course_name text NOT NULL,
    slug text NOT NULL,
    description text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: communities_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.communities_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: communities_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.communities_id_seq OWNED BY public.communities.id;


--
-- Name: community_bans; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_bans (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    target_uid text NOT NULL,
    issued_by_uid text NOT NULL,
    reason text,
    active boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    lifted_at timestamp with time zone,
    lifted_by_uid text
);


--
-- Name: community_bans_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_bans_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_bans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_bans_id_seq OWNED BY public.community_bans.id;


--
-- Name: community_comment_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_comment_reports (
    id bigint NOT NULL,
    report_id bigint NOT NULL,
    community_id integer NOT NULL,
    comment_id bigint NOT NULL,
    reporter_uid text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_comment_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_comment_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_comment_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_comment_reports_id_seq OWNED BY public.community_comment_reports.id;


--
-- Name: community_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_comments (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    post_id bigint NOT NULL,
    author_uid text NOT NULL,
    content text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    taken_down_by_uid text,
    taken_down_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_comments_status_check CHECK ((status = ANY (ARRAY['active'::text, 'taken_down'::text])))
);


--
-- Name: community_comments_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_comments_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_comments_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_comments_id_seq OWNED BY public.community_comments.id;


--
-- Name: community_memberships; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_memberships (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    user_uid text NOT NULL,
    state text NOT NULL,
    joined_at timestamp with time zone,
    left_at timestamp with time zone,
    banned_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_memberships_state_check CHECK ((state = ANY (ARRAY['pending'::text, 'member'::text, 'banned'::text, 'left'::text])))
);


--
-- Name: community_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_memberships_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_memberships_id_seq OWNED BY public.community_memberships.id;


--
-- Name: community_post_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post_likes (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    post_id bigint NOT NULL,
    user_uid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_post_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_post_likes_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_post_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_post_likes_id_seq OWNED BY public.community_post_likes.id;


--
-- Name: community_post_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_post_reports (
    id bigint NOT NULL,
    report_id bigint NOT NULL,
    community_id integer NOT NULL,
    post_id bigint NOT NULL,
    reporter_uid text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_post_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_post_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_post_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_post_reports_id_seq OWNED BY public.community_post_reports.id;


--
-- Name: community_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_posts (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    author_uid text NOT NULL,
    title text NOT NULL,
    content text NOT NULL,
    visibility text DEFAULT 'community'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    taken_down_by_uid text,
    taken_down_reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    attachment_type text,
    attachment_key text,
    attachment_link text,
    attachment_title text,
    attachment_library_document_uuid uuid,
    attachment_filename text,
    attachment_mime_type text,
    likes_count integer DEFAULT 0 NOT NULL,
    CONSTRAINT community_posts_status_check CHECK ((status = ANY (ARRAY['active'::text, 'taken_down'::text]))),
    CONSTRAINT community_posts_visibility_check CHECK ((visibility = ANY (ARRAY['community'::text, 'main_course_only'::text])))
);


--
-- Name: community_posts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_posts_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_posts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_posts_id_seq OWNED BY public.community_posts.id;


--
-- Name: community_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_reports (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    reporter_uid text NOT NULL,
    target_uid text,
    target_type text NOT NULL,
    target_post_id bigint,
    target_comment_id bigint,
    reason text,
    status text DEFAULT 'open'::text NOT NULL,
    resolution_note text,
    resolved_by_uid text,
    resolved_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_reports_status_check CHECK ((status = ANY (ARRAY['open'::text, 'under_review'::text, 'resolved_action_taken'::text, 'resolved_no_action'::text, 'rejected'::text]))),
    CONSTRAINT community_reports_target_type_check CHECK ((target_type = ANY (ARRAY['member'::text, 'moderator'::text, 'post'::text, 'comment'::text])))
);


--
-- Name: community_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_reports_id_seq OWNED BY public.community_reports.id;


--
-- Name: community_roles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_roles (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    user_uid text NOT NULL,
    role text NOT NULL,
    assigned_by_uid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT community_roles_role_check CHECK ((role = 'moderator'::text))
);


--
-- Name: community_roles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_roles_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_roles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_roles_id_seq OWNED BY public.community_roles.id;


--
-- Name: community_rule_acceptances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_rule_acceptances (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    user_uid text NOT NULL,
    version integer NOT NULL,
    accepted_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_rule_acceptances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_rule_acceptances_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_rule_acceptances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_rule_acceptances_id_seq OWNED BY public.community_rule_acceptances.id;


--
-- Name: community_rules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_rules (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    version integer NOT NULL,
    content text NOT NULL,
    created_by_uid text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_rules_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_rules_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_rules_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_rules_id_seq OWNED BY public.community_rules.id;


--
-- Name: community_warnings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_warnings (
    id bigint NOT NULL,
    community_id integer NOT NULL,
    target_uid text NOT NULL,
    issued_by_uid text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: community_warnings_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.community_warnings_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: community_warnings_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.community_warnings_id_seq OWNED BY public.community_warnings.id;


--
-- Name: courses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.courses (
    id integer NOT NULL,
    course_code text NOT NULL,
    course_name text NOT NULL
);


--
-- Name: courses_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.courses_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: courses_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.courses_id_seq OWNED BY public.courses.id;


--
-- Name: document_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.document_likes (
    id integer NOT NULL,
    document_uuid uuid NOT NULL,
    user_uid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: document_likes_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.document_likes_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: document_likes_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.document_likes_id_seq OWNED BY public.document_likes.id;


--
-- Name: documents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.documents (
    id integer NOT NULL,
    uuid uuid NOT NULL,
    title text NOT NULL,
    description text,
    filename text NOT NULL,
    uploader_uid text NOT NULL,
    uploaddate timestamp with time zone DEFAULT now() NOT NULL,
    course text NOT NULL,
    subject text NOT NULL,
    views integer DEFAULT 0 NOT NULL,
    popularity integer DEFAULT 0 NOT NULL,
    visibility text NOT NULL,
    aiallowed boolean DEFAULT false NOT NULL,
    link text NOT NULL,
    thumbnail_link text,
    CONSTRAINT documents_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'private'::text])))
);


--
-- Name: documents_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.documents_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: documents_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.documents_id_seq OWNED BY public.documents.id;


--
-- Name: email_verification_tokens; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_verification_tokens (
    id bigint NOT NULL,
    uid text NOT NULL,
    token_digest text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_verification_tokens_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_verification_tokens_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_verification_tokens_id_seq OWNED BY public.email_verification_tokens.id;


--
-- Name: follow_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follow_requests (
    id bigint NOT NULL,
    requester_uid text NOT NULL,
    target_uid text NOT NULL,
    status text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follow_requests_check CHECK ((requester_uid <> target_uid)),
    CONSTRAINT follow_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'accepted'::text, 'declined'::text, 'canceled'::text])))
);


--
-- Name: follow_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.follow_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: follow_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.follow_requests_id_seq OWNED BY public.follow_requests.id;


--
-- Name: follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.follows (
    id bigint NOT NULL,
    follower_uid text NOT NULL,
    target_uid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT follows_check CHECK ((follower_uid <> target_uid))
);


--
-- Name: follows_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.follows_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: follows_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.follows_id_seq OWNED BY public.follows.id;


--
-- Name: hidden_post_authors; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.hidden_post_authors (
    id bigint NOT NULL,
    user_uid text NOT NULL,
    hidden_uid text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT hidden_post_authors_check CHECK ((user_uid <> hidden_uid))
);


--
-- Name: hidden_post_authors_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.hidden_post_authors_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: hidden_post_authors_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.hidden_post_authors_id_seq OWNED BY public.hidden_post_authors.id;


--
-- Name: profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.profiles (
    id integer NOT NULL,
    uid text NOT NULL,
    display_name text,
    bio text,
    main_course text,
    sub_courses text[],
    facebook text,
    linkedin text,
    instagram text,
    github text,
    portfolio text,
    photo_link text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: profiles_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.profiles_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: profiles_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.profiles_id_seq OWNED BY public.profiles.id;


--
-- Name: room_chat_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_chat_messages (
    id bigint NOT NULL,
    room_id bigint NOT NULL,
    sender_uid text NOT NULL,
    body text NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: room_chat_messages_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_chat_messages_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_chat_messages_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_chat_messages_id_seq OWNED BY public.room_chat_messages.id;


--
-- Name: room_invites; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_invites (
    id bigint NOT NULL,
    room_id bigint NOT NULL,
    token_digest text NOT NULL,
    created_by_uid text NOT NULL,
    expires_at timestamp with time zone NOT NULL,
    revoked_at timestamp with time zone,
    created_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: room_invites_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_invites_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_invites_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_invites_id_seq OWNED BY public.room_invites.id;


--
-- Name: room_moderation_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_moderation_events (
    id bigint NOT NULL,
    room_id bigint,
    actor_uid text NOT NULL,
    target_uid text,
    action text NOT NULL,
    meta jsonb,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_moderation_events_action_check CHECK ((action = ANY (ARRAY['create_room'::text, 'request_room'::text, 'approve_request'::text, 'reject_request'::text, 'start_room'::text, 'end_room'::text, 'kick_participant'::text])))
);


--
-- Name: room_moderation_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_moderation_events_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_moderation_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_moderation_events_id_seq OWNED BY public.room_moderation_events.id;


--
-- Name: room_participants; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_participants (
    id bigint NOT NULL,
    room_id bigint NOT NULL,
    user_uid text NOT NULL,
    role text DEFAULT 'participant'::text NOT NULL,
    status text DEFAULT 'active'::text NOT NULL,
    mic_on boolean DEFAULT true NOT NULL,
    video_on boolean DEFAULT true NOT NULL,
    screen_sharing boolean DEFAULT false NOT NULL,
    joined_at timestamp with time zone DEFAULT now() NOT NULL,
    left_at timestamp with time zone,
    CONSTRAINT room_participants_role_check CHECK ((role = ANY (ARRAY['host'::text, 'co_host'::text, 'participant'::text]))),
    CONSTRAINT room_participants_status_check CHECK ((status = ANY (ARRAY['active'::text, 'left'::text, 'kicked'::text])))
);


--
-- Name: room_participants_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_participants_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_participants_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_participants_id_seq OWNED BY public.room_participants.id;


--
-- Name: room_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.room_requests (
    id bigint NOT NULL,
    requester_uid text NOT NULL,
    meet_name text NOT NULL,
    visibility text NOT NULL,
    community_id integer,
    course_name text,
    max_participants integer NOT NULL,
    allow_mic boolean DEFAULT true NOT NULL,
    allow_video boolean DEFAULT true NOT NULL,
    allow_screen_share boolean DEFAULT false NOT NULL,
    password_hash text,
    scheduled_at timestamp with time zone,
    status text NOT NULL,
    expires_at timestamp with time zone DEFAULT (now() + '1 day'::interval) NOT NULL,
    reviewed_by_uid text,
    reviewed_at timestamp with time zone,
    decision_note text,
    approved_room_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT room_requests_max_participants_check CHECK (((max_participants >= 2) AND (max_participants <= 99))),
    CONSTRAINT room_requests_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'expired'::text]))),
    CONSTRAINT room_requests_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'course_exclusive'::text, 'private'::text])))
);


--
-- Name: room_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.room_requests_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: room_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.room_requests_id_seq OWNED BY public.room_requests.id;


--
-- Name: rooms; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.rooms (
    id bigint NOT NULL,
    meet_id text NOT NULL,
    meet_name text NOT NULL,
    creator_uid text NOT NULL,
    visibility text NOT NULL,
    community_id integer,
    course_name text,
    max_participants integer NOT NULL,
    allow_mic boolean DEFAULT true NOT NULL,
    allow_video boolean DEFAULT true NOT NULL,
    allow_screen_share boolean DEFAULT false NOT NULL,
    password_hash text,
    state text NOT NULL,
    scheduled_at timestamp with time zone,
    started_at timestamp with time zone,
    ended_at timestamp with time zone,
    source_request_id bigint,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT rooms_max_participants_check CHECK (((max_participants >= 2) AND (max_participants <= 99))),
    CONSTRAINT rooms_state_check CHECK ((state = ANY (ARRAY['pending_approval'::text, 'scheduled'::text, 'live'::text, 'ended'::text, 'canceled'::text]))),
    CONSTRAINT rooms_visibility_check CHECK ((visibility = ANY (ARRAY['public'::text, 'course_exclusive'::text, 'private'::text])))
);


--
-- Name: rooms_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.rooms_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: rooms_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.rooms_id_seq OWNED BY public.rooms.id;


--
-- Name: user_presence; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_presence (
    uid text NOT NULL,
    last_active_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL
);


--
-- Name: user_privacy_settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_privacy_settings (
    uid text NOT NULL,
    searchable boolean DEFAULT true NOT NULL,
    follow_approval_required boolean DEFAULT true NOT NULL,
    non_follower_chat_policy text DEFAULT 'request'::text NOT NULL,
    active_visible boolean DEFAULT true NOT NULL,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    updated_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_privacy_settings_non_follower_chat_policy_check CHECK ((non_follower_chat_policy = ANY (ARRAY['allow'::text, 'request'::text, 'deny'::text])))
);


--
-- Name: user_profile_reports; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_profile_reports (
    id bigint NOT NULL,
    reporter_uid text NOT NULL,
    target_uid text NOT NULL,
    reason text,
    created_at timestamp with time zone DEFAULT now() NOT NULL,
    CONSTRAINT user_profile_reports_check CHECK ((reporter_uid <> target_uid))
);


--
-- Name: user_profile_reports_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.user_profile_reports_id_seq
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: user_profile_reports_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.user_profile_reports_id_seq OWNED BY public.user_profile_reports.id;


--
-- Name: accounts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts ALTER COLUMN id SET DEFAULT nextval('public.accounts_id_seq'::regclass);


--
-- Name: admin_audit_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_audit_logs_id_seq'::regclass);


--
-- Name: blocked_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users ALTER COLUMN id SET DEFAULT nextval('public.blocked_users_id_seq'::regclass);


--
-- Name: chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages ALTER COLUMN id SET DEFAULT nextval('public.chat_messages_id_seq'::regclass);


--
-- Name: chat_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants ALTER COLUMN id SET DEFAULT nextval('public.chat_participants_id_seq'::regclass);


--
-- Name: chat_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_requests ALTER COLUMN id SET DEFAULT nextval('public.chat_requests_id_seq'::regclass);


--
-- Name: chat_threads id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads ALTER COLUMN id SET DEFAULT nextval('public.chat_threads_id_seq'::regclass);


--
-- Name: communities id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities ALTER COLUMN id SET DEFAULT nextval('public.communities_id_seq'::regclass);


--
-- Name: community_bans id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_bans ALTER COLUMN id SET DEFAULT nextval('public.community_bans_id_seq'::regclass);


--
-- Name: community_comment_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports ALTER COLUMN id SET DEFAULT nextval('public.community_comment_reports_id_seq'::regclass);


--
-- Name: community_comments id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments ALTER COLUMN id SET DEFAULT nextval('public.community_comments_id_seq'::regclass);


--
-- Name: community_memberships id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships ALTER COLUMN id SET DEFAULT nextval('public.community_memberships_id_seq'::regclass);


--
-- Name: community_post_likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_likes ALTER COLUMN id SET DEFAULT nextval('public.community_post_likes_id_seq'::regclass);


--
-- Name: community_post_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports ALTER COLUMN id SET DEFAULT nextval('public.community_post_reports_id_seq'::regclass);


--
-- Name: community_posts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts ALTER COLUMN id SET DEFAULT nextval('public.community_posts_id_seq'::regclass);


--
-- Name: community_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports ALTER COLUMN id SET DEFAULT nextval('public.community_reports_id_seq'::regclass);


--
-- Name: community_roles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_roles ALTER COLUMN id SET DEFAULT nextval('public.community_roles_id_seq'::regclass);


--
-- Name: community_rule_acceptances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rule_acceptances ALTER COLUMN id SET DEFAULT nextval('public.community_rule_acceptances_id_seq'::regclass);


--
-- Name: community_rules id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rules ALTER COLUMN id SET DEFAULT nextval('public.community_rules_id_seq'::regclass);


--
-- Name: community_warnings id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_warnings ALTER COLUMN id SET DEFAULT nextval('public.community_warnings_id_seq'::regclass);


--
-- Name: courses id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses ALTER COLUMN id SET DEFAULT nextval('public.courses_id_seq'::regclass);


--
-- Name: document_likes id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_likes ALTER COLUMN id SET DEFAULT nextval('public.document_likes_id_seq'::regclass);


--
-- Name: documents id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents ALTER COLUMN id SET DEFAULT nextval('public.documents_id_seq'::regclass);


--
-- Name: email_verification_tokens id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens ALTER COLUMN id SET DEFAULT nextval('public.email_verification_tokens_id_seq'::regclass);


--
-- Name: follow_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_requests ALTER COLUMN id SET DEFAULT nextval('public.follow_requests_id_seq'::regclass);


--
-- Name: follows id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows ALTER COLUMN id SET DEFAULT nextval('public.follows_id_seq'::regclass);


--
-- Name: hidden_post_authors id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_post_authors ALTER COLUMN id SET DEFAULT nextval('public.hidden_post_authors_id_seq'::regclass);


--
-- Name: profiles id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles ALTER COLUMN id SET DEFAULT nextval('public.profiles_id_seq'::regclass);


--
-- Name: room_chat_messages id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_chat_messages ALTER COLUMN id SET DEFAULT nextval('public.room_chat_messages_id_seq'::regclass);


--
-- Name: room_invites id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invites ALTER COLUMN id SET DEFAULT nextval('public.room_invites_id_seq'::regclass);


--
-- Name: room_moderation_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_moderation_events ALTER COLUMN id SET DEFAULT nextval('public.room_moderation_events_id_seq'::regclass);


--
-- Name: room_participants id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants ALTER COLUMN id SET DEFAULT nextval('public.room_participants_id_seq'::regclass);


--
-- Name: room_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_requests ALTER COLUMN id SET DEFAULT nextval('public.room_requests_id_seq'::regclass);


--
-- Name: rooms id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms ALTER COLUMN id SET DEFAULT nextval('public.rooms_id_seq'::regclass);


--
-- Name: user_profile_reports id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profile_reports ALTER COLUMN id SET DEFAULT nextval('public.user_profile_reports_id_seq'::regclass);


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
-- Data for Name: chat_threads; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.chat_threads (id, thread_type, created_by_uid, title, created_at) FROM stdin;
1	direct	6ca79bfd-0cb0-4aa1-be02-16ab659fadff	\N	2026-02-13 12:18:17.984776+08
2	direct	45cd2fda-ece1-46ba-8e5b-7e91c296be46	\N	2026-02-13 21:34:24.444688+08
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
-- Data for Name: community_comment_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_comment_reports (id, report_id, community_id, comment_id, reporter_uid, reason, created_at) FROM stdin;
\.


--
-- Data for Name: community_comments; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_comments (id, community_id, post_id, author_uid, content, status, taken_down_by_uid, taken_down_reason, created_at, updated_at) FROM stdin;
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
-- Data for Name: community_posts; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_posts (id, community_id, author_uid, title, content, visibility, status, taken_down_by_uid, taken_down_reason, created_at, updated_at, attachment_type, attachment_key, attachment_link, attachment_title, attachment_library_document_uuid, attachment_filename, attachment_mime_type, likes_count) FROM stdin;
1	16	614b5df1-7ba2-48b2-82d5-ddfb0dda4a55	Hello	Wazzuppppp	main_course_only	active	\N	\N	2026-02-13 22:40:31.589468+08	2026-02-13 22:56:34.595006+08	\N	\N	\N	\N	\N	\N	\N	1
\.


--
-- Data for Name: community_reports; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.community_reports (id, community_id, reporter_uid, target_uid, target_type, target_post_id, target_comment_id, reason, status, resolution_note, resolved_by_uid, resolved_at, created_at, updated_at) FROM stdin;
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
-- Data for Name: documents; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.documents (id, uuid, title, description, filename, uploader_uid, uploaddate, course, subject, views, popularity, visibility, aiallowed, link, thumbnail_link) FROM stdin;
7	bf12b8a9-05a6-4e40-920c-fc646d71927c	Chase	dawdadadas	digital-signatures-and-web-security.pptx	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-10 23:15:30.036785+08	Cybersecurity	Signatures	0	0	public	f	library/1770736526782-f38eeb4ecbb3-digital-signatures-and-web-security.pptx	\N
8	78ca081e-6d47-422d-bfe8-54ec93849d4a	Second	dwasdwadw	BSCS.pdf	45cd2fda-ece1-46ba-8e5b-7e91c296be46	2026-02-10 23:16:22.772056+08	Computer Science	Program	0	0	public	f	library/1770736580570-a6c45604051b-BSCS.pdf	\N
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
-- Data for Name: rooms; Type: TABLE DATA; Schema: public; Owner: -
--

COPY public.rooms (id, meet_id, meet_name, creator_uid, visibility, community_id, course_name, max_participants, allow_mic, allow_video, allow_screen_share, password_hash, state, scheduled_at, started_at, ended_at, source_request_id, created_at, updated_at) FROM stdin;
1	CKQVCYGQ	DSA	45cd2fda-ece1-46ba-8e5b-7e91c296be46	public	\N	\N	25	t	t	f	\N	ended	\N	2026-02-14 00:57:35.832+08	2026-02-14 10:43:26.901429+08	\N	2026-02-14 00:57:35.83118+08	2026-02-14 10:43:26.901429+08
35	QRKTU3AE	Data Structures	45cd2fda-ece1-46ba-8e5b-7e91c296be46	public	16	Computer Science	25	t	t	f	\N	ended	\N	2026-02-14 11:04:06.703+08	2026-02-14 11:16:24.456993+08	\N	2026-02-14 11:04:06.702166+08	2026-02-14 11:16:24.456993+08
36	S8ST9RZJ	kwqabjkawnj-dca	45cd2fda-ece1-46ba-8e5b-7e91c296be46	public	\N	\N	25	t	t	f	\N	ended	\N	2026-02-14 11:16:49.584+08	2026-02-14 11:17:38.334163+08	\N	2026-02-14 11:16:49.582742+08	2026-02-14 11:17:38.334163+08
2	HDD7QB8D	Test	45cd2fda-ece1-46ba-8e5b-7e91c296be46	course_exclusive	16	Computer Science	25	t	t	f	\N	ended	\N	2026-02-14 10:50:42.114+08	2026-02-14 12:58:59.838107+08	\N	2026-02-14 10:50:42.111569+08	2026-02-14 12:58:59.838107+08
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
-- Name: accounts accounts_email_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_email_key UNIQUE (email);


--
-- Name: accounts accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_pkey PRIMARY KEY (id);


--
-- Name: admin_audit_logs admin_audit_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id);


--
-- Name: auth_schema_meta auth_schema_meta_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.auth_schema_meta
    ADD CONSTRAINT auth_schema_meta_pkey PRIMARY KEY (key);


--
-- Name: blocked_users blocked_users_blocker_uid_blocked_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocker_uid_blocked_uid_key UNIQUE (blocker_uid, blocked_uid);


--
-- Name: blocked_users blocked_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_pkey PRIMARY KEY (id);


--
-- Name: chat_messages chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_pkey PRIMARY KEY (id);


--
-- Name: chat_participants chat_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_pkey PRIMARY KEY (id);


--
-- Name: chat_participants chat_participants_thread_id_user_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_thread_id_user_uid_key UNIQUE (thread_id, user_uid);


--
-- Name: chat_requests chat_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_requests
    ADD CONSTRAINT chat_requests_pkey PRIMARY KEY (id);


--
-- Name: chat_requests chat_requests_requester_uid_target_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_requests
    ADD CONSTRAINT chat_requests_requester_uid_target_uid_key UNIQUE (requester_uid, target_uid);


--
-- Name: chat_threads chat_threads_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_pkey PRIMARY KEY (id);


--
-- Name: communities communities_course_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_course_code_key UNIQUE (course_code);


--
-- Name: communities communities_course_name_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_course_name_key UNIQUE (course_name);


--
-- Name: communities communities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_pkey PRIMARY KEY (id);


--
-- Name: communities communities_slug_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.communities
    ADD CONSTRAINT communities_slug_key UNIQUE (slug);


--
-- Name: community_bans community_bans_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_bans
    ADD CONSTRAINT community_bans_pkey PRIMARY KEY (id);


--
-- Name: community_comment_reports community_comment_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports
    ADD CONSTRAINT community_comment_reports_pkey PRIMARY KEY (id);


--
-- Name: community_comment_reports community_comment_reports_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports
    ADD CONSTRAINT community_comment_reports_report_id_key UNIQUE (report_id);


--
-- Name: community_comments community_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_pkey PRIMARY KEY (id);


--
-- Name: community_memberships community_memberships_community_id_user_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_community_id_user_uid_key UNIQUE (community_id, user_uid);


--
-- Name: community_memberships community_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_pkey PRIMARY KEY (id);


--
-- Name: community_post_likes community_post_likes_community_id_post_id_user_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_likes
    ADD CONSTRAINT community_post_likes_community_id_post_id_user_uid_key UNIQUE (community_id, post_id, user_uid);


--
-- Name: community_post_likes community_post_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_likes
    ADD CONSTRAINT community_post_likes_pkey PRIMARY KEY (id);


--
-- Name: community_post_reports community_post_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports
    ADD CONSTRAINT community_post_reports_pkey PRIMARY KEY (id);


--
-- Name: community_post_reports community_post_reports_report_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports
    ADD CONSTRAINT community_post_reports_report_id_key UNIQUE (report_id);


--
-- Name: community_posts community_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_pkey PRIMARY KEY (id);


--
-- Name: community_reports community_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_pkey PRIMARY KEY (id);


--
-- Name: community_roles community_roles_community_id_user_uid_role_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_roles
    ADD CONSTRAINT community_roles_community_id_user_uid_role_key UNIQUE (community_id, user_uid, role);


--
-- Name: community_roles community_roles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_roles
    ADD CONSTRAINT community_roles_pkey PRIMARY KEY (id);


--
-- Name: community_rule_acceptances community_rule_acceptances_community_id_user_uid_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rule_acceptances
    ADD CONSTRAINT community_rule_acceptances_community_id_user_uid_version_key UNIQUE (community_id, user_uid, version);


--
-- Name: community_rule_acceptances community_rule_acceptances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rule_acceptances
    ADD CONSTRAINT community_rule_acceptances_pkey PRIMARY KEY (id);


--
-- Name: community_rules community_rules_community_id_version_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rules
    ADD CONSTRAINT community_rules_community_id_version_key UNIQUE (community_id, version);


--
-- Name: community_rules community_rules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rules
    ADD CONSTRAINT community_rules_pkey PRIMARY KEY (id);


--
-- Name: community_warnings community_warnings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_warnings
    ADD CONSTRAINT community_warnings_pkey PRIMARY KEY (id);


--
-- Name: courses courses_course_code_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_course_code_key UNIQUE (course_code);


--
-- Name: courses courses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.courses
    ADD CONSTRAINT courses_pkey PRIMARY KEY (id);


--
-- Name: document_likes document_likes_document_uuid_user_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_likes
    ADD CONSTRAINT document_likes_document_uuid_user_uid_key UNIQUE (document_uuid, user_uid);


--
-- Name: document_likes document_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_likes
    ADD CONSTRAINT document_likes_pkey PRIMARY KEY (id);


--
-- Name: documents documents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_pkey PRIMARY KEY (id);


--
-- Name: documents documents_uuid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uuid_key UNIQUE (uuid);


--
-- Name: email_verification_tokens email_verification_tokens_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_pkey PRIMARY KEY (id);


--
-- Name: email_verification_tokens email_verification_tokens_token_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_token_digest_key UNIQUE (token_digest);


--
-- Name: email_verification_tokens email_verification_tokens_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_uid_key UNIQUE (uid);


--
-- Name: follow_requests follow_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_requests
    ADD CONSTRAINT follow_requests_pkey PRIMARY KEY (id);


--
-- Name: follow_requests follow_requests_requester_uid_target_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_requests
    ADD CONSTRAINT follow_requests_requester_uid_target_uid_key UNIQUE (requester_uid, target_uid);


--
-- Name: follows follows_follower_uid_target_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_uid_target_uid_key UNIQUE (follower_uid, target_uid);


--
-- Name: follows follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_pkey PRIMARY KEY (id);


--
-- Name: hidden_post_authors hidden_post_authors_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_post_authors
    ADD CONSTRAINT hidden_post_authors_pkey PRIMARY KEY (id);


--
-- Name: hidden_post_authors hidden_post_authors_user_uid_hidden_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_post_authors
    ADD CONSTRAINT hidden_post_authors_user_uid_hidden_uid_key UNIQUE (user_uid, hidden_uid);


--
-- Name: profiles profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_pkey PRIMARY KEY (id);


--
-- Name: profiles profiles_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_uid_key UNIQUE (uid);


--
-- Name: room_chat_messages room_chat_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_chat_messages
    ADD CONSTRAINT room_chat_messages_pkey PRIMARY KEY (id);


--
-- Name: room_invites room_invites_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invites
    ADD CONSTRAINT room_invites_pkey PRIMARY KEY (id);


--
-- Name: room_invites room_invites_token_digest_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invites
    ADD CONSTRAINT room_invites_token_digest_key UNIQUE (token_digest);


--
-- Name: room_moderation_events room_moderation_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_moderation_events
    ADD CONSTRAINT room_moderation_events_pkey PRIMARY KEY (id);


--
-- Name: room_participants room_participants_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_pkey PRIMARY KEY (id);


--
-- Name: room_participants room_participants_room_id_user_uid_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_room_id_user_uid_key UNIQUE (room_id, user_uid);


--
-- Name: room_requests room_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_requests
    ADD CONSTRAINT room_requests_pkey PRIMARY KEY (id);


--
-- Name: rooms rooms_meet_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_meet_id_key UNIQUE (meet_id);


--
-- Name: rooms rooms_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_pkey PRIMARY KEY (id);


--
-- Name: user_presence user_presence_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_pkey PRIMARY KEY (uid);


--
-- Name: user_privacy_settings user_privacy_settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privacy_settings
    ADD CONSTRAINT user_privacy_settings_pkey PRIMARY KEY (uid);


--
-- Name: user_profile_reports user_profile_reports_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profile_reports
    ADD CONSTRAINT user_profile_reports_pkey PRIMARY KEY (id);


--
-- Name: accounts_display_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_display_name_lower_idx ON public.accounts USING btree (lower(COALESCE(display_name, username, email)));


--
-- Name: accounts_uid_text_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX accounts_uid_text_idx ON public.accounts USING btree (uid);


--
-- Name: accounts_uid_unique_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX accounts_uid_unique_idx ON public.accounts USING btree (uid);


--
-- Name: admin_audit_logs_action_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_action_idx ON public.admin_audit_logs USING btree (action_key, created_at DESC);


--
-- Name: admin_audit_logs_course_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_course_idx ON public.admin_audit_logs USING btree (course, created_at DESC);


--
-- Name: admin_audit_logs_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_created_idx ON public.admin_audit_logs USING btree (created_at DESC);


--
-- Name: admin_audit_logs_executor_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX admin_audit_logs_executor_idx ON public.admin_audit_logs USING btree (executor_uid, created_at DESC);


--
-- Name: blocked_users_blocked_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocked_users_blocked_idx ON public.blocked_users USING btree (blocked_uid);


--
-- Name: blocked_users_blocker_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX blocked_users_blocker_idx ON public.blocked_users USING btree (blocker_uid);


--
-- Name: chat_messages_thread_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_messages_thread_created_idx ON public.chat_messages USING btree (thread_id, created_at DESC, id DESC);


--
-- Name: chat_participants_thread_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_participants_thread_status_idx ON public.chat_participants USING btree (thread_id, status);


--
-- Name: chat_participants_user_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_participants_user_status_idx ON public.chat_participants USING btree (user_uid, status);


--
-- Name: chat_requests_requester_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_requests_requester_status_idx ON public.chat_requests USING btree (requester_uid, status);


--
-- Name: chat_requests_target_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX chat_requests_target_status_idx ON public.chat_requests USING btree (target_uid, status);


--
-- Name: communities_course_name_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX communities_course_name_idx ON public.communities USING btree (course_name);


--
-- Name: community_comment_reports_comment_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_comment_reports_comment_idx ON public.community_comment_reports USING btree (comment_id, created_at DESC);


--
-- Name: community_comment_reports_community_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_comment_reports_community_idx ON public.community_comment_reports USING btree (community_id, created_at DESC);


--
-- Name: community_comments_post_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_comments_post_created_idx ON public.community_comments USING btree (post_id, created_at);


--
-- Name: community_memberships_community_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_memberships_community_state_idx ON public.community_memberships USING btree (community_id, state);


--
-- Name: community_memberships_user_state_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_memberships_user_state_idx ON public.community_memberships USING btree (user_uid, state);


--
-- Name: community_post_likes_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_post_likes_post_idx ON public.community_post_likes USING btree (post_id, created_at DESC);


--
-- Name: community_post_likes_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_post_likes_user_idx ON public.community_post_likes USING btree (user_uid, created_at DESC);


--
-- Name: community_post_reports_community_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_post_reports_community_idx ON public.community_post_reports USING btree (community_id, created_at DESC);


--
-- Name: community_post_reports_post_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_post_reports_post_idx ON public.community_post_reports USING btree (post_id, created_at DESC);


--
-- Name: community_posts_community_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_posts_community_created_idx ON public.community_posts USING btree (community_id, created_at DESC);


--
-- Name: community_posts_community_likes_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_posts_community_likes_idx ON public.community_posts USING btree (community_id, likes_count DESC, created_at DESC);


--
-- Name: community_reports_community_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_reports_community_status_idx ON public.community_reports USING btree (community_id, status, created_at DESC);


--
-- Name: community_roles_community_role_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX community_roles_community_role_idx ON public.community_roles USING btree (community_id, role);


--
-- Name: documents_course_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_course_idx ON public.documents USING btree (course);


--
-- Name: documents_popularity_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_popularity_idx ON public.documents USING btree (popularity);


--
-- Name: documents_uploaddate_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_uploaddate_idx ON public.documents USING btree (uploaddate);


--
-- Name: documents_views_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX documents_views_idx ON public.documents USING btree (views);


--
-- Name: email_verification_tokens_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_expires_idx ON public.email_verification_tokens USING btree (expires_at);


--
-- Name: email_verification_tokens_uid_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX email_verification_tokens_uid_idx ON public.email_verification_tokens USING btree (uid);


--
-- Name: follow_requests_requester_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_requests_requester_status_idx ON public.follow_requests USING btree (requester_uid, status);


--
-- Name: follow_requests_target_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follow_requests_target_status_idx ON public.follow_requests USING btree (target_uid, status);


--
-- Name: follows_follower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_follower_idx ON public.follows USING btree (follower_uid);


--
-- Name: follows_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX follows_target_idx ON public.follows USING btree (target_uid);


--
-- Name: hidden_post_authors_hidden_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hidden_post_authors_hidden_idx ON public.hidden_post_authors USING btree (hidden_uid);


--
-- Name: hidden_post_authors_user_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX hidden_post_authors_user_idx ON public.hidden_post_authors USING btree (user_uid);


--
-- Name: profiles_display_name_lower_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX profiles_display_name_lower_idx ON public.profiles USING btree (lower(COALESCE(display_name, ''::text)));


--
-- Name: room_chat_messages_room_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_chat_messages_room_created_idx ON public.room_chat_messages USING btree (room_id, created_at DESC);


--
-- Name: room_invites_room_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_invites_room_expires_idx ON public.room_invites USING btree (room_id, expires_at);


--
-- Name: room_moderation_events_room_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_moderation_events_room_created_idx ON public.room_moderation_events USING btree (room_id, created_at DESC);


--
-- Name: room_participants_room_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_participants_room_status_idx ON public.room_participants USING btree (room_id, status, joined_at DESC);


--
-- Name: room_requests_community_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_requests_community_status_idx ON public.room_requests USING btree (community_id, status, created_at DESC);


--
-- Name: room_requests_requester_status_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_requests_requester_status_idx ON public.room_requests USING btree (requester_uid, status, created_at DESC);


--
-- Name: room_requests_status_expires_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX room_requests_status_expires_idx ON public.room_requests USING btree (status, expires_at);


--
-- Name: rooms_community_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rooms_community_created_idx ON public.rooms USING btree (community_id, created_at DESC);


--
-- Name: rooms_creator_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rooms_creator_created_idx ON public.rooms USING btree (creator_uid, created_at DESC);


--
-- Name: rooms_state_scheduled_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rooms_state_scheduled_idx ON public.rooms USING btree (state, scheduled_at);


--
-- Name: rooms_visibility_created_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX rooms_visibility_created_idx ON public.rooms USING btree (visibility, created_at DESC);


--
-- Name: user_profile_reports_target_idx; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX user_profile_reports_target_idx ON public.user_profile_reports USING btree (target_uid, created_at DESC);


--
-- Name: accounts accounts_banned_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.accounts
    ADD CONSTRAINT accounts_banned_by_uid_fkey FOREIGN KEY (banned_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: admin_audit_logs admin_audit_logs_executor_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_audit_logs
    ADD CONSTRAINT admin_audit_logs_executor_uid_fkey FOREIGN KEY (executor_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: blocked_users blocked_users_blocked_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocked_uid_fkey FOREIGN KEY (blocked_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: blocked_users blocked_users_blocker_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.blocked_users
    ADD CONSTRAINT blocked_users_blocker_uid_fkey FOREIGN KEY (blocker_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_sender_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_sender_uid_fkey FOREIGN KEY (sender_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: chat_messages chat_messages_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_messages
    ADD CONSTRAINT chat_messages_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


--
-- Name: chat_participants chat_participants_thread_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.chat_threads(id) ON DELETE CASCADE;


--
-- Name: chat_participants chat_participants_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_participants
    ADD CONSTRAINT chat_participants_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: chat_requests chat_requests_requester_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_requests
    ADD CONSTRAINT chat_requests_requester_uid_fkey FOREIGN KEY (requester_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: chat_requests chat_requests_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_requests
    ADD CONSTRAINT chat_requests_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: chat_threads chat_threads_created_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.chat_threads
    ADD CONSTRAINT chat_threads_created_by_uid_fkey FOREIGN KEY (created_by_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_bans community_bans_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_bans
    ADD CONSTRAINT community_bans_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_bans community_bans_issued_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_bans
    ADD CONSTRAINT community_bans_issued_by_uid_fkey FOREIGN KEY (issued_by_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_bans community_bans_lifted_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_bans
    ADD CONSTRAINT community_bans_lifted_by_uid_fkey FOREIGN KEY (lifted_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_bans community_bans_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_bans
    ADD CONSTRAINT community_bans_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_comment_reports community_comment_reports_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports
    ADD CONSTRAINT community_comment_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.community_comments(id) ON DELETE CASCADE;


--
-- Name: community_comment_reports community_comment_reports_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports
    ADD CONSTRAINT community_comment_reports_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_comment_reports community_comment_reports_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports
    ADD CONSTRAINT community_comment_reports_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.community_reports(id) ON DELETE CASCADE;


--
-- Name: community_comment_reports community_comment_reports_reporter_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comment_reports
    ADD CONSTRAINT community_comment_reports_reporter_uid_fkey FOREIGN KEY (reporter_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_comments community_comments_author_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_author_uid_fkey FOREIGN KEY (author_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_comments community_comments_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_comments community_comments_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_comments community_comments_taken_down_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_comments
    ADD CONSTRAINT community_comments_taken_down_by_uid_fkey FOREIGN KEY (taken_down_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_memberships community_memberships_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_memberships community_memberships_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_memberships
    ADD CONSTRAINT community_memberships_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_post_likes community_post_likes_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_likes
    ADD CONSTRAINT community_post_likes_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_post_likes community_post_likes_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_likes
    ADD CONSTRAINT community_post_likes_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_post_likes community_post_likes_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_likes
    ADD CONSTRAINT community_post_likes_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_post_reports community_post_reports_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports
    ADD CONSTRAINT community_post_reports_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_post_reports community_post_reports_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports
    ADD CONSTRAINT community_post_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.community_posts(id) ON DELETE CASCADE;


--
-- Name: community_post_reports community_post_reports_report_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports
    ADD CONSTRAINT community_post_reports_report_id_fkey FOREIGN KEY (report_id) REFERENCES public.community_reports(id) ON DELETE CASCADE;


--
-- Name: community_post_reports community_post_reports_reporter_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_post_reports
    ADD CONSTRAINT community_post_reports_reporter_uid_fkey FOREIGN KEY (reporter_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_posts community_posts_attachment_library_document_uuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_attachment_library_document_uuid_fkey FOREIGN KEY (attachment_library_document_uuid) REFERENCES public.documents(uuid) ON DELETE SET NULL;


--
-- Name: community_posts community_posts_author_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_author_uid_fkey FOREIGN KEY (author_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_posts community_posts_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_posts community_posts_taken_down_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_posts
    ADD CONSTRAINT community_posts_taken_down_by_uid_fkey FOREIGN KEY (taken_down_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_reports community_reports_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_reports community_reports_reporter_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_reporter_uid_fkey FOREIGN KEY (reporter_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_reports community_reports_resolved_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_resolved_by_uid_fkey FOREIGN KEY (resolved_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_reports community_reports_target_comment_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_target_comment_id_fkey FOREIGN KEY (target_comment_id) REFERENCES public.community_comments(id) ON DELETE SET NULL;


--
-- Name: community_reports community_reports_target_post_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_target_post_id_fkey FOREIGN KEY (target_post_id) REFERENCES public.community_posts(id) ON DELETE SET NULL;


--
-- Name: community_reports community_reports_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_reports
    ADD CONSTRAINT community_reports_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_roles community_roles_assigned_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_roles
    ADD CONSTRAINT community_roles_assigned_by_uid_fkey FOREIGN KEY (assigned_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_roles community_roles_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_roles
    ADD CONSTRAINT community_roles_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_roles community_roles_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_roles
    ADD CONSTRAINT community_roles_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_rule_acceptances community_rule_acceptances_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rule_acceptances
    ADD CONSTRAINT community_rule_acceptances_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_rule_acceptances community_rule_acceptances_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rule_acceptances
    ADD CONSTRAINT community_rule_acceptances_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_rules community_rules_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rules
    ADD CONSTRAINT community_rules_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_rules community_rules_created_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_rules
    ADD CONSTRAINT community_rules_created_by_uid_fkey FOREIGN KEY (created_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: community_warnings community_warnings_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_warnings
    ADD CONSTRAINT community_warnings_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE CASCADE;


--
-- Name: community_warnings community_warnings_issued_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_warnings
    ADD CONSTRAINT community_warnings_issued_by_uid_fkey FOREIGN KEY (issued_by_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: community_warnings community_warnings_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_warnings
    ADD CONSTRAINT community_warnings_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: document_likes document_likes_document_uuid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_likes
    ADD CONSTRAINT document_likes_document_uuid_fkey FOREIGN KEY (document_uuid) REFERENCES public.documents(uuid) ON DELETE CASCADE;


--
-- Name: document_likes document_likes_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.document_likes
    ADD CONSTRAINT document_likes_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: documents documents_uploader_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.documents
    ADD CONSTRAINT documents_uploader_uid_fkey FOREIGN KEY (uploader_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: email_verification_tokens email_verification_tokens_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_verification_tokens
    ADD CONSTRAINT email_verification_tokens_uid_fkey FOREIGN KEY (uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: follow_requests follow_requests_requester_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_requests
    ADD CONSTRAINT follow_requests_requester_uid_fkey FOREIGN KEY (requester_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: follow_requests follow_requests_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follow_requests
    ADD CONSTRAINT follow_requests_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: follows follows_follower_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_follower_uid_fkey FOREIGN KEY (follower_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: follows follows_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.follows
    ADD CONSTRAINT follows_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: hidden_post_authors hidden_post_authors_hidden_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_post_authors
    ADD CONSTRAINT hidden_post_authors_hidden_uid_fkey FOREIGN KEY (hidden_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: hidden_post_authors hidden_post_authors_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.hidden_post_authors
    ADD CONSTRAINT hidden_post_authors_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: profiles profiles_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.profiles
    ADD CONSTRAINT profiles_uid_fkey FOREIGN KEY (uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: room_chat_messages room_chat_messages_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_chat_messages
    ADD CONSTRAINT room_chat_messages_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: room_chat_messages room_chat_messages_sender_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_chat_messages
    ADD CONSTRAINT room_chat_messages_sender_uid_fkey FOREIGN KEY (sender_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: room_invites room_invites_created_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invites
    ADD CONSTRAINT room_invites_created_by_uid_fkey FOREIGN KEY (created_by_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: room_invites room_invites_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_invites
    ADD CONSTRAINT room_invites_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: room_moderation_events room_moderation_events_actor_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_moderation_events
    ADD CONSTRAINT room_moderation_events_actor_uid_fkey FOREIGN KEY (actor_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: room_moderation_events room_moderation_events_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_moderation_events
    ADD CONSTRAINT room_moderation_events_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: room_moderation_events room_moderation_events_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_moderation_events
    ADD CONSTRAINT room_moderation_events_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: room_participants room_participants_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_room_id_fkey FOREIGN KEY (room_id) REFERENCES public.rooms(id) ON DELETE CASCADE;


--
-- Name: room_participants room_participants_user_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_participants
    ADD CONSTRAINT room_participants_user_uid_fkey FOREIGN KEY (user_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: room_requests room_requests_approved_room_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_requests
    ADD CONSTRAINT room_requests_approved_room_id_fkey FOREIGN KEY (approved_room_id) REFERENCES public.rooms(id) ON DELETE SET NULL;


--
-- Name: room_requests room_requests_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_requests
    ADD CONSTRAINT room_requests_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE SET NULL;


--
-- Name: room_requests room_requests_requester_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_requests
    ADD CONSTRAINT room_requests_requester_uid_fkey FOREIGN KEY (requester_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: room_requests room_requests_reviewed_by_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.room_requests
    ADD CONSTRAINT room_requests_reviewed_by_uid_fkey FOREIGN KEY (reviewed_by_uid) REFERENCES public.accounts(uid) ON DELETE SET NULL;


--
-- Name: rooms rooms_community_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_community_id_fkey FOREIGN KEY (community_id) REFERENCES public.communities(id) ON DELETE SET NULL;


--
-- Name: rooms rooms_creator_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.rooms
    ADD CONSTRAINT rooms_creator_uid_fkey FOREIGN KEY (creator_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: user_presence user_presence_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_presence
    ADD CONSTRAINT user_presence_uid_fkey FOREIGN KEY (uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: user_privacy_settings user_privacy_settings_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_privacy_settings
    ADD CONSTRAINT user_privacy_settings_uid_fkey FOREIGN KEY (uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: user_profile_reports user_profile_reports_reporter_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profile_reports
    ADD CONSTRAINT user_profile_reports_reporter_uid_fkey FOREIGN KEY (reporter_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- Name: user_profile_reports user_profile_reports_target_uid_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_profile_reports
    ADD CONSTRAINT user_profile_reports_target_uid_fkey FOREIGN KEY (target_uid) REFERENCES public.accounts(uid) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

\unrestrict BwMriCZSpt1pYq6PVR8dJJTgqx63DPhNPyavEhwQdLLuiFmga9210OdjgRq3Yu6

