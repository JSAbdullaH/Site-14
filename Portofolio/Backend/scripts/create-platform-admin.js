require('dotenv').config({ quiet: true });
const readline = require('node:readline/promises');
const { stdin, stdout } = require('node:process');
const { prisma } = require('../src/config/db');
const { upsertAdmin } = require('../src/services/platformAuth.service');
const { PRODUCTS } = require('../prisma/catalog');

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
}

async function ask(question, { hidden = false } = {}) {
  const rl = readline.createInterface({ input: stdin, output: stdout, terminal: true });
  if (hidden) rl._writeToOutput = (text) => stdout.write(text.includes(question) ? text : '');
  const answer = await rl.question(question);
  rl.close();
  if (hidden) stdout.write('\n');
  return answer.trim();
}

async function main() {
  if (process.argv.includes('--help')) {
    console.log('Usage: npm run platform:admin -- --email owner@example.com --name "Full Name" [--catalog]');
    console.log('The password is read from PLATFORM_ADMIN_PASSWORD, or asked for.');
    console.log('--catalog also adds the default marketplace products that are missing (matched by SKU).');
    return;
  }

  const email = (arg('email') || (await ask('Email: '))).toLowerCase();
  const fullName = arg('name') || (await ask('Full name: '));
  const password = process.env.PLATFORM_ADMIN_PASSWORD || (await ask('Password (min 12 characters): ', { hidden: true }));

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
  if (fullName.length < 2) throw new Error('Enter a full name');
  if (password.length < 12) throw new Error('Use a password of at least 12 characters');

  const admin = await upsertAdmin({ email, fullName, password });
  console.log(`Website owner account ready: ${admin.email}`);

  if (process.argv.includes('--catalog')) {
    const { count } = await prisma.product.createMany({ data: PRODUCTS, skipDuplicates: true });
    console.log(`Marketplace catalog: ${count} product${count === 1 ? '' : 's'} added`);
  }
}

main()
  .catch((err) => {
    console.error(err.message);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
