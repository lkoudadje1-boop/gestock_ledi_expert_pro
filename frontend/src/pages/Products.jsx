const handleSave = async (e) => {
    e.preventDefault();
    const token = localStorage.getItem('token');
    
    // 1. Détermination de l'ID (Conservation si modification, génération si création)
    const isEditing = Boolean(newArticle.id);
    const articleId = isEditing ? newArticle.id : `ART-${Date.now().toString().slice(-6)}`;

    // 2. Préparation du payload sans succursale
    const dataToSend = {
        ...newArticle, 
        id: articleId,
        nom: newArticle.nom.trim().toUpperCase(),
        group_id: parseInt(newArticle.group_id) || null,
        is_configured: 1
        // On a supprimé branch_id ici
    };

    try {
        setLoading(true); // Optionnel : pour gérer un état de chargement sur le bouton

        // 3. Appel à la route "FULL" (INSERT OR REPLACE)
        const response = await fetch(`http://localhost:3030/api/products/full`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(dataToSend)
        });

        if (response.ok) {
            alert(isEditing ? "✅ Article mis à jour !" : "✅ Article créé !");
            
            // Fermeture de la modale si elle existe
            if (typeof setShowModal === 'function') setShowModal(false);
            
            // Rafraîchissement de la liste globale
            if (typeof fetchInitialData === 'function') fetchInitialData();
            
        } else {
            const errorData = await response.json();
            alert("Erreur : " + (errorData.error || "Échec de l'enregistrement"));
        }
    } catch (err) {
        console.error("Erreur serveur:", err);
        alert("Erreur de communication avec le serveur.");
    } finally {
        setLoading(false);
    }
};