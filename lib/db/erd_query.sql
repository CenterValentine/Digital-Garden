-- ERD Generation Query for Digital Garden Database
-- Run this query in your PostgreSQL database to extract schema information for ERD tools
-- Compatible with tools like dbdiagram.io, draw.io, or other ERD generators

-- ============================================================================
-- 1. TABLES AND COLUMNS
-- ============================================================================
SELECT 
    'TABLE' as object_type,
    t.table_schema,
    t.table_name,
    c.column_name,
    c.data_type,
    c.character_maximum_length,
    c.is_nullable,
    c.column_default,
    c.ordinal_position
FROM 
    information_schema.tables t
    JOIN information_schema.columns c ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT LIKE '_prisma%'
ORDER BY 
    t.table_name, c.ordinal_position;

-- ============================================================================
-- 2. PRIMARY KEYS
-- ============================================================================
SELECT 
    'PRIMARY_KEY' as object_type,
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
WHERE 
    tc.constraint_type = 'PRIMARY KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name NOT LIKE '_prisma%'
ORDER BY 
    tc.table_name, kcu.ordinal_position;

-- ============================================================================
-- 3. FOREIGN KEYS (RELATIONSHIPS)
-- ============================================================================
SELECT 
    'FOREIGN_KEY' as object_type,
    tc.table_schema,
    tc.table_name as from_table,
    kcu.column_name as from_column,
    ccu.table_name as to_table,
    ccu.column_name as to_column,
    tc.constraint_name,
    rc.update_rule,
    rc.delete_rule
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name NOT LIKE '_prisma%'
ORDER BY 
    tc.table_name, kcu.ordinal_position;

-- ============================================================================
-- 4. UNIQUE CONSTRAINTS
-- ============================================================================
SELECT 
    'UNIQUE' as object_type,
    tc.table_schema,
    tc.table_name,
    kcu.column_name,
    tc.constraint_name
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
WHERE 
    tc.constraint_type = 'UNIQUE'
    AND tc.table_schema = 'public'
    AND tc.table_name NOT LIKE '_prisma%'
ORDER BY 
    tc.table_name, kcu.ordinal_position;

-- ============================================================================
-- 5. INDEXES
-- ============================================================================
SELECT 
    'INDEX' as object_type,
    schemaname as table_schema,
    tablename as table_name,
    indexname,
    indexdef
FROM 
    pg_indexes
WHERE 
    schemaname = 'public'
    AND tablename NOT LIKE '_prisma%'
ORDER BY 
    tablename, indexname;

-- ============================================================================
-- 6. COMPREHENSIVE ERD DATA (ALL IN ONE)
-- ============================================================================
-- This query combines all information in a format suitable for ERD tools
WITH table_info AS (
    SELECT DISTINCT
        t.table_name,
        obj_description(c.oid, 'pg_class') as table_comment
    FROM 
        information_schema.tables t
        JOIN pg_class c ON c.relname = t.table_name
        JOIN pg_namespace n ON n.oid = c.relnamespace AND n.nspname = 'public'
    WHERE 
        t.table_schema = 'public'
        AND t.table_type = 'BASE TABLE'
        AND t.table_name NOT LIKE '_prisma%'
)
SELECT 
    'ERD_DATA' as query_type,
    jsonb_build_object(
        'tables', (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'name', ti.table_name,
                    'comment', COALESCE(ti.table_comment, ''),
                    'columns', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'name', c.column_name,
                                'type', c.data_type || 
                                    CASE 
                                        WHEN c.character_maximum_length IS NOT NULL 
                                        THEN '(' || c.character_maximum_length || ')'
                                        ELSE ''
                                    END,
                                'nullable', c.is_nullable = 'YES',
                                'default', c.column_default,
                                'position', c.ordinal_position
                            ) ORDER BY c.ordinal_position
                        )
                        FROM information_schema.columns c
                        WHERE c.table_name = ti.table_name
                        AND c.table_schema = 'public'
                    ),
                    'primary_keys', (
                        SELECT jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position)
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu 
                            ON tc.constraint_name = kcu.constraint_name
                        WHERE tc.table_name = ti.table_name
                        AND tc.constraint_type = 'PRIMARY KEY'
                    ),
                    'foreign_keys', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'from_column', kcu.column_name,
                                'to_table', ccu.table_name,
                                'to_column', ccu.column_name,
                                'on_update', rc.update_rule,
                                'on_delete', rc.delete_rule
                            )
                        )
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu 
                            ON tc.constraint_name = kcu.constraint_name
                        JOIN information_schema.constraint_column_usage ccu 
                            ON ccu.constraint_name = tc.constraint_name
                        JOIN information_schema.referential_constraints rc
                            ON tc.constraint_name = rc.constraint_name
                        WHERE tc.table_name = ti.table_name
                        AND tc.constraint_type = 'FOREIGN KEY'
                    ),
                    'unique_constraints', (
                        SELECT jsonb_agg(
                            jsonb_build_object(
                                'columns', jsonb_agg(kcu.column_name ORDER BY kcu.ordinal_position),
                                'name', tc.constraint_name
                            )
                        )
                        FROM information_schema.table_constraints tc
                        JOIN information_schema.key_column_usage kcu 
                            ON tc.constraint_name = kcu.constraint_name
                        WHERE tc.table_name = ti.table_name
                        AND tc.constraint_type = 'UNIQUE'
                        GROUP BY tc.constraint_name
                    )
                )
            )
            FROM table_info ti
        )
    ) as erd_json;

-- ============================================================================
-- 7. SIMPLIFIED RELATIONSHIP MAP (for quick reference)
-- ============================================================================
SELECT 
    'RELATIONSHIP_MAP' as query_type,
    tc.table_name as "From Table",
    kcu.column_name as "From Column",
    '->' as "Relationship",
    ccu.table_name as "To Table",
    ccu.column_name as "To Column",
    CASE rc.delete_rule
        WHEN 'CASCADE' THEN 'CASCADE'
        WHEN 'SET NULL' THEN 'SET NULL'
        WHEN 'RESTRICT' THEN 'RESTRICT'
        ELSE rc.delete_rule
    END as "On Delete"
FROM 
    information_schema.table_constraints tc
    JOIN information_schema.key_column_usage kcu 
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
    JOIN information_schema.constraint_column_usage ccu 
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
    JOIN information_schema.referential_constraints rc
        ON tc.constraint_name = rc.constraint_name
        AND tc.table_schema = rc.constraint_schema
WHERE 
    tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_schema = 'public'
    AND tc.table_name NOT LIKE '_prisma%'
ORDER BY 
    tc.table_name, kcu.ordinal_position;

