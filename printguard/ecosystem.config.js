module.exports = {
  apps: [
    {
      name: 'printguard',
      script: 'index.js',
      watch: false,
      env: {
        LDAP_URL: '',
        LDAP_BASE_DN: '',
        LDAP_USER: '',
        LDAP_PASS: '',
        POLL_INTERVAL_MS: '5000',
      },
    },
  ],
};