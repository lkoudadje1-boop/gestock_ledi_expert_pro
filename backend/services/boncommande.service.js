const { getDb } = require('../config/database');
const conversestock = require('./conversestock');

class BonCommandeService {
    /**
     * Génère un ID unique avec préfixe conforme à la politique de l'application
     */
    genererId(prefix) {
        return `${prefix}-${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 100)}`;
    }

    /**
     * Enregistre un bon de commande et ses articles associés (Sans impacter le stock physique)
     */
    saveBonCommande(payload, user) {
        const db = getDb();
        const { header, items } = payload;
        
        const companyId = (user?.company_id || user?.companyId)?.toString();
        const userId = (user?.userId || user?.id)?.toString();

        const orderId = this.genererId('CMD');
        const currentDate = header.date || new Date().toISOString();
        const totalFacture = parseFloat(header.totalFacture) || 0;

        // 🛡️ LOGIQUE TRANSACTIONNELLE STRICTEMENT SYNCHRONE (BETTER-SQLITE3)
        const executerTransaction = db.transaction(() => {
            
            // 1. Insertion de l'en-tête du Bon de Commande (purchase_orders)
            db.prepare(`
                INSERT INTO purchase_orders (
                    id, num_bon, supplier_id, total_facture, montant_avance, 
                    montant_paye, reste_a_payer, moyen_reglement, statut_commande, 
                    observations, date_commande, user_id, company_id, sync_status
                ) VALUES (?, ?, ?, ?, 0, 0, ?, NULL, 'EN_ATTENTE', ?, ?, ?, ?, 'pending')
            `).run(
                orderId,
                header.numBon,
                header.fournisseurId,
                totalFacture,
                totalFacture, // reste_a_payer = total_facture au départ
                header.observations || null,
                currentDate,
                userId,
                companyId
            );

            // Enregistrement du Header dans la file de synchronisation
            db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                VALUES ('purchase_orders', ?, 'INSERT', ?)
            `).run(orderId, companyId);

            // 2. Préparation des requêtes d'insertion pour les items
            const insertItemStmt = db.prepare(`
                INSERT INTO purchase_order_items (
                    id, order_id, num_bon, product_id, nom_article_snap, 
                    observation, qte_achetee, quantite_pieces_natives, unit_coefficient, 
                    unit_code_gros, unit_ref_detail, prix_achat_unitaire, montant_facture_ligne, 
                    montant_ht_ligne, montant_tva_ligne, user_id, company_id, sync_status
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending')
            `);

            const syncQueueStmt = db.prepare(`
                INSERT INTO sync_queue (table_name, record_id, operation, company_id)
                VALUES ('purchase_order_items', ?, 'INSERT', ?)
            `);

            // 3. Boucle de traitement et conversion logistique des articles
            for (const item of items) {
                const itemId = this.genererId('CMD-ITEM');
                const productId = item.product_id || item.productId;

                // 🔍 Récupération à chaud des coefficients et unités configurés en BDD
                const itemUnitData = db.prepare(`
                    SELECT u.coefficient, u.code as unit_code_gros, u.unite_reference as unit_ref_detail
                    FROM products p
                    LEFT JOIN unites u ON p.unite_id = u.id
                    WHERE p.id = ?
                `).get(productId);

                const coeff = itemUnitData && itemUnitData.coefficient ? Number(itemUnitData.coefficient) : 1;
                const codeGros = itemUnitData && itemUnitData.unit_code_gros ? itemUnitData.unit_code_gros : 'CS';
                const refDetail = itemUnitData && itemUnitData.unit_ref_detail ? itemUnitData.unit_ref_detail : 'PCS';

                // 📦 SÉCURISATION LOGISTIQUE : Conversion de la chaîne ("21 + 7") en pièces de détail
                const qteSaisieTextuelle = String(item.qte_achetee || '0');
                const qteNatives = conversestock.calculerUnitesNatives(db, productId, qteSaisieTextuelle);

                // Calcul financier de la ligne ramené à la pièce native unitaire
                const prixUnitaireBrut = parseFloat(item.prix_achat_unitaire || item.prix_achat || 0);
                const prixUnitairePiece = coeff > 1 ? (prixUnitaireBrut / coeff) : prixUnitaireBrut;
                const mntLigne = parseFloat(item.montant_facture_ligne || (qteNatives * prixUnitairePiece)) || 0;

                // Exécution de l'insertion de l'item
                insertItemStmt.run(
                    itemId,
                    orderId,
                    header.numBon,
                    productId,
                    item.nom_article_snap || item.designation || 'Article inconnu',
                    item.observation || null,
                    qteSaisieTextuelle,
                    qteNatives,
                    coeff,
                    codeGros,
                    refDetail,
                    prixUnitaireBrut,
                    mntLigne,
                    item.montant_ht_ligne || mntLigne,
                    item.montant_tva_ligne || 0,
                    userId,
                    companyId
                );

                // Enregistrement de l'article dans la file de synchronisation
                syncQueueStmt.run(itemId, companyId);
            }

            return orderId;
        });

        // Exécution de la transaction sécurisée
        return executerTransaction();
    }

    /**
     * 🎯 EXTRACTION DE L'HISTORIQUE DE L'EN-TÊTE UNIQUE (POUR LE TABLEAU DE GAUCHE)
     */
    getAllBonsCommande(companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT 
                po.*,
                s.nom as fournisseur_nom
            FROM purchase_orders po
            LEFT JOIN suppliers s ON po.supplier_id = s.id
            WHERE po.company_id = ? AND po.is_active = 1
            ORDER BY po.created_at DESC
        `).all(companyId.toString());
    }

    /**
     * 🎯 EXTRACTION DES ARTICLES LIÉS À UN BON SPÉCIFIQUE (POUR LE PANIER DE DROITE AU CLIC)
     */
    getBonCommandeItems(orderId, companyId) {
        const db = getDb();
        return db.prepare(`
            SELECT *
            FROM purchase_order_items
            WHERE order_id = ? AND companyId = ? AND is_active = 1
            ORDER BY created_at ASC
        `).all(orderId.toString(), companyId.toString());
    }
}

module.exports = new BonCommandeService();