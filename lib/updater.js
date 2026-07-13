// lib/updater.js - Auto-pull latest commits
const simpleGit = require('simple-git');
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

class Updater {
    constructor() {
        this.git = simpleGit();
        this.repoUrl = process.env.GIT_REPO_URL;
        this.branch = process.env.GIT_BRANCH || 'main';
        this.autoPull = process.env.AUTO_PULL !== 'false';
    }

    async checkAndPull() {
        if (!this.repoUrl) {
            console.log('ℹ️ No GIT_REPO_URL set. Skipping auto-pull.');
            return false;
        }

        if (!this.autoPull) {
            console.log('ℹ️ Auto-pull disabled (AUTO_PULL=false).');
            return false;
        }

        console.log('🔄 Checking for updates...');

        try {
            // Check if .git exists
            if (!fs.existsSync(path.join(__dirname, '../.git'))) {
                console.log('📦 Initializing git repository...');
                await this.cloneRepo();
                return true;
            }

            // Fetch latest changes
            await this.git.fetch();
            
            // Get current commit
            const currentCommit = await this.git.revparse(['HEAD']);
            
            // Get latest commit from remote
            const remoteCommit = await this.git.revparse(['origin/' + this.branch]);
            
            if (currentCommit === remoteCommit) {
                console.log('✅ Already up to date.');
                return false;
            }

            console.log(`📥 Pulling latest changes (${currentCommit.substring(0,7)} → ${remoteCommit.substring(0,7)})...`);
            
            // Pull changes
            await this.git.pull('origin', this.branch);
            
            console.log('✅ Update pulled successfully!');
            
            // Reinstall dependencies if package.json changed
            const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
            const oldPackage = await this.getOldPackage();
            
            if (oldPackage && JSON.stringify(packageJson.dependencies) !== JSON.stringify(oldPackage.dependencies)) {
                console.log('📦 Dependencies changed. Reinstalling...');
                execSync('npm install --production', { stdio: 'inherit' });
                console.log('✅ Dependencies reinstalled.');
            }
            
            return true;
            
        } catch (error) {
            console.error('❌ Update failed:', error.message);
            return false;
        }
    }

    async cloneRepo() {
        try {
            console.log(`📦 Cloning repository: ${this.repoUrl}`);
            
            // Move existing files to temp
            const tempDir = path.join(__dirname, '../temp_backup');
            if (fs.existsSync(tempDir)) {
                fs.rmSync(tempDir, { recursive: true, force: true });
            }
            
            // Clone fresh
            await simpleGit().clone(this.repoUrl, '.', ['--branch', this.branch]);
            
            console.log('✅ Repository cloned successfully!');
            return true;
            
        } catch (error) {
            console.error('❌ Clone failed:', error.message);
            return false;
        }
    }

    async getOldPackage() {
        try {
            const oldPath = path.join(__dirname, '../package.json.bak');
            if (fs.existsSync(oldPath)) {
                return JSON.parse(fs.readFileSync(oldPath, 'utf8'));
            }
            return null;
        } catch {
            return null;
        }
    }

    async savePackageForComparison() {
        try {
            const packagePath = path.join(__dirname, '../package.json');
            const backupPath = path.join(__dirname, '../package.json.bak');
            if (fs.existsSync(packagePath)) {
                fs.copyFileSync(packagePath, backupPath);
            }
        } catch (e) {}
    }
}

module.exports = Updater;