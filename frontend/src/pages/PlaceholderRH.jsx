const nacl = require('tweetnacl');
const util = require('tweetnacl-util');
const fs = require('fs');
const path = require('path');

// Récupération des arguments du terminal : node generer-pour-client.js [CID] [NOUVEAU_MID]
const [, , clientCid, nouveauMid] = process.argv;

if (!clientCid || !nouveauMid) {
    console.log("❌ Utilisation incorrecte !");
    console.log("👉 Exemple : node generer-pour-client.js CPY-49501083 NOUVEAU_MACHINE_ID");
    process.exit(1);
}

const registrePath = path.join(__dirname, 'clients-licences.json');
if (!fs.existsSync(registrePath)) {
    console.error("❌ Fichier 'clients-licences.json' introuvable.");
    process.exit(1);
}

const registre = JSON.parse(fs.readFileSync(registrePath, 'utf8'));
const clientData = registre[clientCid];

if (!clientData) {
    console.error(`❌ Le client avec le code CID '${clientCid}' est introuvable dans le registre.`);
    process.exit(1);
}

// Préparation des données de la licence
const maLicence = {
    id: "LIC-" + Date.now(),
    cid: clientCid,
    exp: clientData.exp,
    owner: clientData.owner,
    mid: nouveauMid, // Le nouveau code machine transmis par le client
    mod: ["GESTOCK", "USERS", "COMPTA_BASE", "ANA_PLAN", "SYSTEM", "PRODUCTION"]
};

try {
    if (!fs.existsSync('secret.key')) {
        throw new Error("Fichier 'secret.key' introuvable. Clé privée manquante.");
    }
    const secretKeyBase64 = fs.readFileSync('secret.key', 'utf8').trim();
    const secretKey = util.decodeBase64(secretKeyBase64);

    const jsonString = JSON.stringify(maLicence);
    const encodedData = Buffer.from(jsonString).toString('base64');
    
    const dataUint8 = util.decodeUTF8(encodedData);
    const signatureUint8 = nacl.sign.detached(dataUint8, secretKey);
    const signature = util.encodeBase64(signatureUint8);

    const finalContent = `${encodedData}.${signature}`;

    // Création d'un dossier de sauvegarde par client
    const clientOutputDir = path.join(__dirname, 'licences_generees', clientCid);
    if (!fs.existsSync(clientOutputDir)){
        fs.mkdirSync(clientOutputDir, { recursive: true });
    }
    
    const outputPath = path.join(clientOutputDir, 'metadata.dat');
    fs.writeFileSync(outputPath, finalContent, 'utf8');

    // Mise à jour de l'historique dans le registre local
    clientData.history.push({
        date: new Date().toISOString().split('T')[0],
        mid: nouveauMid,
        motif: "Remplacement suite à panne de PC"
    });
    clientData.current_mid = nouveauMid;
    fs.writeFileSync(registrePath, JSON.stringify(registre, null, 2), 'utf8');

    console.log("=======================================================");
    console.log("✅ LICENCE DE REMPLACEMENT GÉNÉRÉE AVEC SUCCÈS !");
    console.log(`📍 Fichier prêt à envoyer : ${outputPath}`);
    console.log(`🔒 Nouveau matériel lié   : ${nouveauMid}`);
    console.log("=======================================================");
} catch (error) {
    console.error("❌ Erreur lors de la génération :", error.message);
}