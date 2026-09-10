from django.db import migrations


class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.RunSQL(
            sql="""
            CREATE SCHEMA IF NOT EXISTS geo;
            CREATE SCHEMA IF NOT EXISTS semantic;
            CREATE SCHEMA IF NOT EXISTS catalog;
            CREATE SCHEMA IF NOT EXISTS ingest;
            CREATE SCHEMA IF NOT EXISTS mart;
            CREATE EXTENSION IF NOT EXISTS btree_gist;
            """,
            reverse_sql="""
            DROP SCHEMA IF EXISTS mart CASCADE;
            DROP SCHEMA IF EXISTS ingest CASCADE;
            DROP SCHEMA IF EXISTS catalog CASCADE;
            DROP SCHEMA IF EXISTS semantic CASCADE;
            DROP SCHEMA IF EXISTS geo CASCADE;
            """,
        ),
    ]
