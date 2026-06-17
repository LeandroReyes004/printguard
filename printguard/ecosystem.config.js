module.exports = {
  apps: [
    {
      name:               'printguard',
      script:             'index.js',
      cwd:                __dirname,
      watch:              false,
      max_memory_restart: '200M',
      env: {
        LDAP_URL:         '',
        LDAP_BASE_DN:     '',
        LDAP_USER:        '',
        LDAP_PASS:        '',
        POLL_INTERVAL_MS: '5000',
      },
    },
    {
      name:               'printguard-web',
      script:             'web.js',
      cwd:                __dirname,
      watch:              false,
      max_memory_restart: '150M',
      env: {
        WEB_PORT: '3000',
      },
    },
  ],
};
