const { hashString } = require("./hash");

async function grantRole(roleStore, account, role) {
  await roleStore.grantRole(account, hashString(role));
}

module.exports = {
  grantRole,
};
