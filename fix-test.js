const fs = require('fs');
let content = fs.readFileSync('tests/app.test.js', 'utf8');

const ts = Date.now();
content = content.replace("const userA = {};", "const userA = {};\n  const ts = Date.now();\n  const userAUsername = 'user_a_' + ts;\n  const userBUsername = 'user_b_' + ts;\n  const userAEmail = 'user_a_' + ts + '@test.com';\n  const userBEmail = 'user_b_' + ts + '@test.com';");

content = content.replace(/username: 'alice'/g, 'username: userAUsername');
content = content.replace(/username: 'bob'/g, 'username: userBUsername');
content = content.replace(/'alice@mail\.com'/g, 'userAEmail');
content = content.replace(/'bob@mail\.com'/g, 'userBEmail');
content = content.replace(/'alice2@mail\.com'/g, "'other_' + ts + '@test.com'");
content = content.replace(/first_name: 'Alice'/g, "first_name: 'TestA'");
content = content.replace(/first_name: 'Alice2'/g, "first_name: 'Other'");
content = content.replace(/first_name: 'Bob'/g, "first_name: 'TestB'");

fs.writeFileSync('tests/app.test.js', content);
console.log('Tests updated');
