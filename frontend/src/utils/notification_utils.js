/**
 * Génère des notifications basées UNIQUEMENT sur les données réelles du backend.
 * Zéro mensonge : si le compteur est à 0, la notification n'existe pas.
 */
export const getActiveNotifications = (user, perms, stats) => {
    // Si les stats ne sont pas encore chargées, on retourne une liste vide
    if (!stats) return [];

    const alerts = [];
    const isAdmin = user?.role === 'admin';
    
    // On récupère la date du jour au format YYYY-MM-DD (Heure locale Togo/GMT)
    const todayStr = new Date().toISOString().split('T')[0];

    // 1. BROUILLONS COMPTABLES
    // On vérifie le chiffre réel 'pendingBrouillons' envoyé par le service
    if ((isAdmin || perms?.compta_val) && stats.pendingBrouillons > 0) {
        alerts.push({
            id: 'notif_brouillon',
            type: 'info',
            title: 'Comptabilité',
            message: `${stats.pendingBrouillons} écriture(s) en brouillon à valider.`,
            path: '/compta/validation'
        });
    }

    // 2. CLÔTURE DE CAISSE
    // Comparaison entre la date du jour et 'lastClosureDate' de la base
    if ((isAdmin || perms?.vente_create) && stats.lastClosureDate !== todayStr) {
        alerts.push({
            id: 'notif_cloture',
            type: 'danger',
            title: 'Caisse',
            message: "La clôture journalière n'a pas encore été effectuée.",
            path: '/pos/close'
        });
    }

    // 3. ALERTES STOCK
    // Basé sur 'stockAlerts' calculé par le backend
    if ((isAdmin || perms?.art_view) && stats.stockAlerts > 0) {
        alerts.push({
            id: 'notif_stock',
            type: 'danger',
            title: 'Stocks',
            message: `${stats.stockAlerts} article(s) en dessous du seuil d'alerte.`,
            path: '/admin/articles/list'
        });
    }

    // 4. LICENCE
    // Basé sur 'licenceExpiry' (qui utilise license_start_date ou expiration en base)
    if (isAdmin && stats.licenceExpiry) {
        const expDate = new Date(stats.licenceExpiry);
        const diffTime = expDate - new Date();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        
        // On alerte seulement si l'expiration est proche (moins de 10 jours)
        if (diffDays <= 10) {
            alerts.push({
                id: 'notif_licence',
                type: diffDays <= 0 ? 'danger' : 'warning',
                title: 'Système',
                message: diffDays <= 0 
                    ? "Votre licence a expiré." 
                    : `Votre licence expire dans ${diffDays} jour(s).`,
                path: '/admin/licence'
            });
        }
    }

    return alerts;
};