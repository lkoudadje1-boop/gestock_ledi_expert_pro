# --- Fix Better-SQLite3 for Electron ---

Write-Host "🔹 Nettoyage des anciens builds..."
Remove-Item -Recurse -Force ".\node_modules\better-sqlite3\build" -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force ".\node_modules" -ErrorAction SilentlyContinue
Remove-Item -Force ".\package-lock.json" -ErrorAction SilentlyContinue

Write-Host "🔹 Réinstallation des dépendances..."
npm install

Write-Host "🔹 Rebuild Better-SQLite3 pour Electron..."
# Remplace 30.0.0 par la version exacte de ton Electron si différente
npx electron-rebuild -f -v 30.0.0 -w better-sqlite3

Write-Host "✅ Terminé ! Tu peux maintenant lancer 'npm start'"
