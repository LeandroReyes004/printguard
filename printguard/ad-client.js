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

  const client = ldap.createClient({ url: LDAP_URL });
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
          const obj = entry.object || {};
          entryFound = {
            fullName: obj.cn || safeUsername,
            department: obj.department || 'Unknown',
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