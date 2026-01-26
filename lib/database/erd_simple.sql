-- Simple ERD Query - Run this in your PostgreSQL database
-- Returns all tables, columns, and relationships in a format suitable for ERD tools

SELECT 
    t.table_name as "Table",
    c.column_name as "Column",
    c.data_type || 
        CASE 
            WHEN c.character_maximum_length IS NOT NULL 
            THEN '(' || c.character_maximum_length || ')'
            ELSE ''
        END as "Type",
    CASE WHEN c.is_nullable = 'NO' THEN 'NOT NULL' ELSE 'NULL' END as "Nullable",
    CASE 
        WHEN pk.column_name IS NOT NULL THEN 'PK'
        WHEN fk.column_name IS NOT NULL THEN 'FK'
        WHEN uq.column_name IS NOT NULL THEN 'UQ'
        ELSE ''
    END as "Key",
    fk.ref_table as "References Table",
    fk.ref_column as "References Column"
FROM 
    information_schema.tables t
    JOIN information_schema.columns c 
        ON t.table_name = c.table_name 
        AND t.table_schema = c.table_schema
    LEFT JOIN (
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'PRIMARY KEY'
        AND tc.table_schema = 'public'
    ) pk ON pk.table_name = c.table_name AND pk.column_name = c.column_name
    LEFT JOIN (
        SELECT 
            kcu.table_name,
            kcu.column_name,
            ccu.table_name as ref_table,
            ccu.column_name as ref_column
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu 
            ON ccu.constraint_name = tc.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
        AND tc.table_schema = 'public'
    ) fk ON fk.table_name = c.table_name AND fk.column_name = c.column_name
    LEFT JOIN (
        SELECT kcu.table_name, kcu.column_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu 
            ON tc.constraint_name = kcu.constraint_name
        WHERE tc.constraint_type = 'UNIQUE'
        AND tc.table_schema = 'public'
    ) uq ON uq.table_name = c.table_name AND uq.column_name = c.column_name
WHERE 
    t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name NOT LIKE '_prisma%'
ORDER BY 
    t.table_name, c.ordinal_position;

