--
-- PostgreSQL database dump
--

\restrict uwadEE9RggZ0ueRYtJZ5XBeOGRvkd0KVoOl8o2kpXw5YTGsOlxjKMnMShOF1NPC

-- Dumped from database version 18.4
-- Dumped by pg_dump version 18.4

-- Started on 2026-05-29 13:48:38

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
-- TOC entry 11 (class 2615 OID 18242)
-- Name: Environmental_Layers; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA "Environmental_Layers";


ALTER SCHEMA "Environmental_Layers" OWNER TO postgres;

--
-- TOC entry 10 (class 2615 OID 18241)
-- Name: Parcels; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA "Parcels";


ALTER SCHEMA "Parcels" OWNER TO postgres;

--
-- TOC entry 9 (class 2615 OID 17485)
-- Name: topology; Type: SCHEMA; Schema: -; Owner: postgres
--

CREATE SCHEMA topology;


ALTER SCHEMA topology OWNER TO postgres;

--
-- TOC entry 6641 (class 0 OID 0)
-- Dependencies: 9
-- Name: SCHEMA topology; Type: COMMENT; Schema: -; Owner: postgres
--

COMMENT ON SCHEMA topology IS 'PostGIS Topology schema';


--
-- TOC entry 2 (class 3079 OID 16397)
-- Name: postgis; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis WITH SCHEMA public;


--
-- TOC entry 6642 (class 0 OID 0)
-- Dependencies: 2
-- Name: EXTENSION postgis; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis IS 'PostGIS geometry and geography spatial types and functions';


--
-- TOC entry 4 (class 3079 OID 17674)
-- Name: postgis_raster; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_raster WITH SCHEMA public;


--
-- TOC entry 6643 (class 0 OID 0)
-- Dependencies: 4
-- Name: EXTENSION postgis_raster; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis_raster IS 'PostGIS raster types and functions';


--
-- TOC entry 3 (class 3079 OID 17486)
-- Name: postgis_topology; Type: EXTENSION; Schema: -; Owner: -
--

CREATE EXTENSION IF NOT EXISTS postgis_topology WITH SCHEMA topology;


--
-- TOC entry 6644 (class 0 OID 0)
-- Dependencies: 3
-- Name: EXTENSION postgis_topology; Type: COMMENT; Schema: -; Owner: 
--

COMMENT ON EXTENSION postgis_topology IS 'PostGIS topology spatial types and functions';


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- TOC entry 225 (class 1259 OID 16389)
-- Name: test; Type: TABLE; Schema: public; Owner: postgres
--

CREATE TABLE public.test (
    customer_id numeric(5,0) NOT NULL,
    customer_name text
);


ALTER TABLE public.test OWNER TO postgres;

--
-- TOC entry 6460 (class 0 OID 16716)
-- Dependencies: 227
-- Data for Name: spatial_ref_sys; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.spatial_ref_sys (srid, auth_name, auth_srid, srtext, proj4text) FROM stdin;
\.


--
-- TOC entry 6635 (class 0 OID 16389)
-- Dependencies: 225
-- Data for Name: test; Type: TABLE DATA; Schema: public; Owner: postgres
--

COPY public.test (customer_id, customer_name) FROM stdin;
\.


--
-- TOC entry 6462 (class 0 OID 17488)
-- Dependencies: 232
-- Data for Name: topology; Type: TABLE DATA; Schema: topology; Owner: postgres
--

COPY topology.topology (id, name, srid, "precision", hasz, useslargeids) FROM stdin;
\.


--
-- TOC entry 6463 (class 0 OID 17507)
-- Dependencies: 233
-- Data for Name: layer; Type: TABLE DATA; Schema: topology; Owner: postgres
--

COPY topology.layer (topology_id, layer_id, schema_name, table_name, feature_column, feature_type, level, child_id) FROM stdin;
\.


--
-- TOC entry 6645 (class 0 OID 0)
-- Dependencies: 231
-- Name: topology_id_seq; Type: SEQUENCE SET; Schema: topology; Owner: postgres
--

SELECT pg_catalog.setval('topology.topology_id_seq', 1, false);


--
-- TOC entry 6470 (class 2606 OID 16394)
-- Name: test test_pkey; Type: CONSTRAINT; Schema: public; Owner: postgres
--

ALTER TABLE ONLY public.test
    ADD CONSTRAINT test_pkey PRIMARY KEY (customer_id);


-- Completed on 2026-05-29 13:48:38

--
-- PostgreSQL database dump complete
--

\unrestrict uwadEE9RggZ0ueRYtJZ5XBeOGRvkd0KVoOl8o2kpXw5YTGsOlxjKMnMShOF1NPC

