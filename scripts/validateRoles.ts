import { validateRoles } from "./validateRolesUtils";

async function main() {
  await validateRoles();
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((ex) => {
    console.error(ex);
    process.exit(1);
  });
