import pytest
from scripts.database_backup import connection_options


def test_backup_passes_password_in_environment_not_process_arguments():
    database, args, env = connection_options('mysql+pymysql://club:secret%21@127.0.0.1:3308/club_test')
    assert database == 'club_test'
    assert env['MYSQL_PWD'] == 'secret!'
    assert '--port=3308' in args
    assert all('secret' not in argument for argument in args)


def test_backup_rejects_unimplemented_tls_options_instead_of_ignoring_them():
    with pytest.raises(ValueError):
        connection_options('mysql+pymysql://club:secret@host/club_test?ssl_ca=ca.pem')
