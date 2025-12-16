import argon2 from 'argon2';

const password = 'test123';
const hash = await argon2.hash(password, {
  type: argon2.argon2id,
  memoryCost: 65536,
  timeCost: 3,
  parallelism: 4,
});

console.log(hash);
