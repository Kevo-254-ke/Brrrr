// scripts/postinstall.js
const fs = require('fs');
const path = require('path');

console.log('📦 Setting up project...');

// Create necessary directories
const dirs = ['baileys_auth', 'processed', 'logs'];
for (const dir of dirs) {
    const dirPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(dirPath)) {
        fs.mkdirSync(dirPath, { recursive: true });
        console.log(`✅ Created ${dir}/`);
    }
}

// Create .env if not exists
const envPath = path.join(__dirname, '..', '.env');
if (!fs.existsSync(envPath)) {
    const sampleEnv = `# WhatsApp Bot Configuration
SESSION_ID=
GIT_REPO_URL=https://github.com/yourusername/your-repo.git
GIT_BRANCH=main
AUTO_PULL=true
`;
    fs.writeFileSync(envPath, sampleEnv);
    console.log('✅ Created .env file. Please add your configuration.');
}

console.log('✅ Setup complete!');
console.log('\n📝 Next steps:');
console.log('1. Add your SESSION_ID to .env');
console.log('2. Add your GIT_REPO_URL to .env');
console.log('3. Run: npm start');