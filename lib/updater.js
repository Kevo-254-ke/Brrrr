// lib/updater.js - Fixed Auto-Pull
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
        this.isRepo = false;
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
            const gitPath = path.join(__dirname, '../.git');
            if (!fs.existsSync(gitPath)) {
                console.log('📦 Initializing git repository...');
                // Check if we're already in a git repo
                try {
                    await this.git.checkIsRepo();
                    this.isRepo = true;
                } catch {
                    this.isRepo = false;
                }
                
                if (!this.isRepo) {
                    // If no git, just skip update
                    console.log('ℹ️ Not a git repository. Skipping auto-pull.');
                    return false;
                }
            }

            // Check if we have a remote
            try {
                const remotes = await this.git.getRemotes();
                if (remotes.length === 0) {
                    console.log('ℹ️ No git remote configured. Skipping auto-pull.');
                    return false;
                }
            } catch {
                console.log('ℹ️ No git remote configured. Skipping auto-pull.');
                return false;
            }

            // Fetch latest changes
            console.log('📥 Fetching latest changes...');
            await this.git.fetch();
            
            // Get current commit
            const currentCommit = await this.git.revparse(['HEAD']);
            console.log(`📌 Current commit: ${currentCommit.substring(0, 7)}`);
            
            // Get latest commit from remote
            const remoteCommit = await this.git.revparse(['origin/' + this.branch]);
            console.log(`📌 Remote commit: ${remoteCommit.substring(0, 7)}`);
            
            if (currentCommit === remoteCommit) {
                console.log('✅ Already up to date.');
                return false;
            }

            console.log(`📥 Pulling latest changes (${currentCommit.substring(0,7)} → ${remoteCommit.substring(0,7)})...`);
            
            // Pull changes
            await this.git.pull('origin', this.branch);
            
            console.log('✅ Update pulled successfully!');
            
            // Check if package.json changed
            const packageJson = JSON.parse(fs.readFileSync(path.join(__dirname, '../package.json'), 'utf8'));
            const oldPackagePath = path.join(__dirname, '../package.json.bak');
            
            if (fs.existsSync(oldPackagePath)) {
                const oldPackage = JSON.parse(fs.readFileSync(oldPackagePath, 'utf8'));
                if (JSON.stringify(packageJson.dependencies) !== JSON.stringify(oldPackage.dependencies)) {
                    console.log('📦 Dependencies changed. Reinstalling...');
                    execSync('npm install --production --no-optional', { stdio: 'inherit' });
                    console.log('✅ Dependencies reinstalled.');
                }
            }
            
            // Save current package.json for next comparison
            fs.copyFileSync(
                path.join(__dirname, '../package.json'),
                path.join(__dirname, '../package.json.bak')
            );
            
            return true;
            
        } catch (error) {
            console.error('❌ Update failed:', error.message);
            // Don't crash the bot on update failure
            return false;
        }
    }

    async savePackageForComparison() {
        try {
            const packagePath = path.join(__dirname, '../package.json');
            const backupPath = path.join(__dirname, '../package.json.bak');
            if (fs.existsSync(packagePath) && !fs.existsSync(backupPath)) {
                fs.copyFileSync(packagePath, backupPath);
            }
        } catch (e) {}
    }
}

module.exports = Updater;