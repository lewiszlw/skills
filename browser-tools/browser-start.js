#!/usr/bin/env node

import { spawn, execSync } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import puppeteer from "puppeteer-core";

const useProfile = process.argv[2] === "--profile";

if (process.argv[2] && process.argv[2] !== "--profile") {
	console.log("Usage: browser-start.js [--profile]");
	console.log("\nOptions:");
	console.log("  --profile  Copy your default Chrome profile (cookies, logins)");
	process.exit(1);
}

const HOME_DIR = process.env.HOME || process.env.USERPROFILE;
const SCRAPING_DIR = process.platform === "win32"
	? `${HOME_DIR}\\.cache\\browser-tools`
	: `${HOME_DIR}/.cache/browser-tools`;

// Check if already running on :9222
try {
	const browser = await puppeteer.connect({
		browserURL: "http://localhost:9222",
		defaultViewport: null,
	});
	await browser.disconnect();
	console.log("✓ Chrome already running on :9222");
	process.exit(0);
} catch {}

// Setup profile directory
mkdirSync(SCRAPING_DIR, { recursive: true });

// Remove SingletonLock to allow new instance
try {
	rmSync(`${SCRAPING_DIR}${process.platform === "win32" ? "\\" : "/"}SingletonLock`, { force: true });
	rmSync(`${SCRAPING_DIR}${process.platform === "win32" ? "\\" : "/"}SingletonSocket`, { force: true });
	rmSync(`${SCRAPING_DIR}${process.platform === "win32" ? "\\" : "/"}SingletonCookie`, { force: true });
} catch {}

if (useProfile) {
	console.log("Syncing profile...");
	if (process.platform === "win32") {
		mkdirSync(SCRAPING_DIR, { recursive: true });
		try {
			execSync(
				`robocopy "${process.env.LOCALAPPDATA}\\Google\\Chrome\\User Data" "${SCRAPING_DIR}" /E /R:0 /W:0 /NFL /NDL /NJH /NJS /NP /XF SingletonLock SingletonSocket SingletonCookie "Current Session" "Current Tabs" "Last Session" "Last Tabs" /XD Sessions`,
				{ stdio: "ignore", shell: "cmd.exe" },
			);
		} catch (error) {
			if (error.status >= 16) {
				throw error;
			}
		}
	} else {
		execSync(
			`rsync -a --delete \
				--exclude='SingletonLock' \
				--exclude='SingletonSocket' \
				--exclude='SingletonCookie' \
				--exclude='*/Sessions/*' \
				--exclude='*/Current Session' \
				--exclude='*/Current Tabs' \
				--exclude='*/Last Session' \
				--exclude='*/Last Tabs' \
				"${HOME_DIR}/Library/Application Support/Google/Chrome/" "${SCRAPING_DIR}/"`,
			{ stdio: "pipe" },
		);
	}
}

// Detect Chrome/Chromium path based on OS
function getChromePath() {
	const platform = process.platform;
	
	if (platform === "darwin") {
		// macOS
		return "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
	} else if (platform === "win32") {
		// Windows - try common installation paths
		const paths = [
			process.env.PROGRAMFILES + "\\Google\\Chrome\\Application\\chrome.exe",
			process.env["PROGRAMFILES(X86)"] + "\\Google\\Chrome\\Application\\chrome.exe",
			process.env.LOCALAPPDATA + "\\Google\\Chrome\\Application\\chrome.exe",
		];
		for (const p of paths) {
			try {
				execSync(`if exist "${p}" exit 0`, { stdio: "ignore", shell: "cmd.exe" });
				return p;
			} catch {}
		}
		return "chrome.exe"; // fallback, hope it's in PATH
	} else {
		// Linux - try common paths (apt, snap, etc.)
		const paths = [
			"/usr/bin/google-chrome",
			"/usr/bin/google-chrome-stable",
			"/usr/bin/chromium",
			"/usr/bin/chromium-browser",
			"/snap/bin/chromium",
		];
		for (const p of paths) {
			try {
				execSync(`test -x "${p}"`, { stdio: "ignore" });
				return p;
			} catch {}
		}
		return "google-chrome"; // fallback, hope it's in PATH
	}
}

// Start Chrome with flags to force new instance
spawn(
	getChromePath(),
	[
		"--remote-debugging-port=9222",
		`--user-data-dir=${SCRAPING_DIR}`,
		"--no-first-run",
		"--no-default-browser-check",
	],
	{ detached: true, stdio: "ignore" },
).unref();

// Wait for Chrome to be ready
let connected = false;
for (let i = 0; i < 30; i++) {
	try {
		const browser = await puppeteer.connect({
			browserURL: "http://localhost:9222",
			defaultViewport: null,
		});
		await browser.disconnect();
		connected = true;
		break;
	} catch {
		await new Promise((r) => setTimeout(r, 500));
	}
}

if (!connected) {
	console.error("✗ Failed to connect to Chrome");
	process.exit(1);
}

console.log(`✓ Chrome started on :9222${useProfile ? " with your profile" : ""}`);
