from django.db import migrations


class Migration(migrations.Migration):

    dependencies = [
        ('scanner', '0004_alter_scanreport_options'),
    ]

    operations = [
        migrations.RemoveField(
            model_name='scanurl',
            name='user',
        ),
    ]
