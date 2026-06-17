const ldap = require('ldapjs');

function escapeLdapFilter(value) {
  return value.replace(/[\\*()\x00]/g, (char) => {
    return `\\${char.charCodeAt(0).toString(16).padStart(2, '0')}`;
  });
}

async function getUserInfo(username) {
  const safeUsername = String(username || '').trim();
  if (!safeUsername) {
    return { fullName: username, department: 'Unknown' };
  }

  const { LDAP_URL, LDAP_BASE_DN, LDAP_USER, LDAP_PASS } = process.env;
  if (!LDAP_URL || !LDAP_BASE_DN || !LDAP_USER || !LDAP_PASS) {
    return { fullName: safeUsername, department: 'Unknown' };
  }

  if (LDAP_USER.includes('\\')) {
    process.stderr.write(
      '[PrintGuard] ADVERTENCIA: LDAP_USER contiene "\\". ' +
      'ldapjs no soporta formato DOMAIN\\user. ' +
      'Usa formato UPN (usuario@dominio.com) o DN completo (CN=usuario,DC=dom,DC=com)\n'
    );
  }

  const client = ldap.createClient({ url: LDAP_URL, connectTimeout: 5000, timeout: 5000 });
  const filter = `(&(objectClass=user)(sAMAccountName=${escapeLdapFilter(safeUsername)}))`;
  const opts = { filter, scope: 'sub', attributes: ['cn', 'department'] };

  return new Promise((resolve) => {
    client.bind(LDAP_USER, LDAP_PASS, (bindErr) => {
      if (bindErr) {
        client.destroy();
        return resolve({ fullName: safeUsername, department: 'Unknown' });
      }

      client.search(LDAP_BASE_DN, opts, (searchErr, res) => {
        if (searchErr) {
          client.unbind(() => client.destroy());
          return resolve({ fullName: safeUsername, department: 'Unknown' });
        }

        let entryFound = null;
        res.on('searchEntry', (entry) => {
          let cn = '';
          let dept = '';
          // ldapjs v3: entry.pojo.attributes is [{ type, values }]
          if (entry.pojo && Array.isArray(entry.pojo.attributes)) {
            for (const attr of entry.pojo.attributes) {
              const val = Array.isArray(attr.values) ? attr.values[0] : '';
              if (attr.type === 'cn') cn = val;
              if (attr.type === 'department') dept = val;
            }
          } else {
            // ldapjs v2 fallback
            const obj = entry.object || {};
            cn = obj.cn || '';
            dept = obj.department || '';
          }
          entryFound = {
            fullName: cn || safeUsername,
            department: dept || 'Unknown',
          };
        });

        res.on('error', () => {
          client.unbind(() => client.destroy());
          return resolve({ fullName: safeUsername, department: 'Unknown' });
        });

        res.on('end', () => {
          client.unbind(() => client.destroy());
          if (entryFound) {
            return resolve(entryFound);
          }
          return resolve({ fullName: safeUsername, department: 'Unknown' });
        });
      });
    });
  });
}

module.exports = { getUserInfo };