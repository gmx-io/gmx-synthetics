async function grantRole(roleStore, account, role) {
  await roleStore.grantRole(account, ethers.utils.solidityKeccak256(["string"], [role]));
}

module.exports = {
  grantRole,
};
