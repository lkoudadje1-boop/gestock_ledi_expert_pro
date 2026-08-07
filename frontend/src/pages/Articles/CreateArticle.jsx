import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom'; 
import { Save, ArrowLeft, Percent, DollarSign, Package, ShieldCheck, Image as ImageIcon, Hash, CheckCircle, XCircle, Plus, Trash2 } from 'lucide-react'; 
import Sidebar from '../../components/Sidebar';
import { productAPI } from '../../services/productAPI';
import API, { socket } from '../../services/api'; 

// --- 1. DÉFINITION DES STYLES ---
const card = { background: 'white', padding: '18px', borderRadius: '10px', boxShadow: '0 2px 4px rgba(0,0,0,0.05)', marginBottom: '15px' };
const inp = { width: '100%', padding: '7px', borderRadius: '5px', border: '1px solid #cbd5e1', fontSize: '13px', outline: 'none' };
const lbl = { display: 'block', fontSize: '11px', fontWeight: '600', color: '#475569', marginBottom: '2px' };

// --- NOUVEAUX STYLES POUR FIGER LA PAGE ET GERER LES SCROLLS IMBRIQUÉS ---
const layoutStyles = `
  .fixed-screen-container {
    height: 100vh;
    overflow: hidden;
    display: flex;
    background-color: #f8fafc;
  }
  .editor-main-area {
    display: flex;
    flex-direction: column;
    flex: 1;
    overflow: hidden;
  }
  .editor-scrollable-body {
    flex: 1;
    overflow-y: auto;
    padding: 20px 30px;
  }
  .side-by-side-modules {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-top: 15px;
    align-items: start;
  }
  .paliers-scrollzone {
    max-height: 165px;
    overflow-y: auto;
    padding-right: 5px;
  }
  .remises-scrollzone {
    max-height: 380px;
    overflow-y: auto;
    padding-right: 5px;
  }
`;

const CreateArticle = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditMode = Boolean(id); 
  
  const genererIdArticle = () => `ART-${Date.now().toString().slice(-6)}`;

  const [notification, setNotification] = useState({ show: false, message: '', type: 'success' });

  const [familles, setFamilles] = useState([]);
  const [categories, setCategories] = useState([]);
  const [groupes, setGroupes] = useState([]);
  const [unites, setUnites] = useState([]); 
  
  const [isInventoryActive, setIsInventoryActive] = useState(false);
  const [selFamille, setSelFamille] = useState('');
  const [selCategorie, setSelCategorie] = useState('');
  const [imagePreview, setImagePreview] = useState(null);

  const initialFormState = {
    id_article: genererIdArticle(), 
    nom: '', codeBarre: '', unite_id: '', group_id: '', image_path: '',
    branch_id: 1, is_active: 1, cmp: 0, prixVente: 0, taxeActive: 0, taxeTaux: 0, stockAlerte: '0', stock_actuel: '0', remiseActive: 0,
    palierActive: 0, // Gère l'activation visuelle de la case MODULE ACTIF pour les paliers
    paliers: [], 
    r1Active: 0, r1Seuil: 0, r1Montant: 0, r1Taux: 0, r1IsPromo: 0, r1DateDebut: '', r1DateFin: '',
    r2Active: 0, r2Seuil: 0, r2Montant: 0, r2Taux: 0, r2IsPromo: 0, r2DateDebut: '', r2DateFin: '',
    r3Active: 0, r3Multiple: 0, r3Montant: 0, r3Taux: 0, r3IsPromo: 0, r3DateDebut: '', r3DateFin: '',
    r4Active: 0, r4A_Max: 0, r4A_Montant: 0, r4A_Taux: 0, r4B_Max: 0, r4B_Montant: 0, r4B_Taux: 0, r4C_Montant: 0, r4C_Taux: 0, r4IsPromo: 0, r4DateDebut: '', r4DateFin: ''
  };

  const [formData, setFormData] = useState(isEditMode ? { ...initialFormState, id_article: '' } : initialFormState);

  // Injecter dynamiquement les styles de figeage d'écran
  useEffect(() => {
    const styleTag = document.createElement('style');
    styleTag.innerHTML = layoutStyles;
    document.head.appendChild(styleTag);
    return () => document.head.removeChild(styleTag);
  }, []);

  const showMsg = (message, type = 'success') => {
    setNotification({ show: true, message, type });
    setTimeout(() => setNotification({ show: false, message: '', type: 'success' }), 3000);
  };

  const resetForm = () => {
    setFormData({ ...initialFormState, id_article: genererIdArticle() });
    setSelFamille('');
    setSelCategorie('');
    setImagePreview(null);
  };

  // 🌟 HELPER LOGISTIQUE CRUCIAL : Récupère dynamiquement le coefficient de l'unité sélectionnée
  const getCoeffActuel = () => {
    if (!formData.unite_id) return 1;
    const ut = unites.find(u => String(u.id || u.ID) === String(formData.unite_id));
    if (ut) return Number(ut.coefficient || ut.COEFFICIENT) || 1;

    // Analyse de secours textuelle si les liaisons asynchrones sont lentes (ex: "C12" -> 12)
    const labelSecours = String(formData.unite_libelle || formData.unite_id || "");
    const extractionChiffre = parseInt(labelSecours.replace(/[^0-9]/g, ''), 10);
    return extractionChiffre && extractionChiffre > 1 ? extractionChiffre : 1;
  };

  // 🌟 HELPER LOGISTIQUE CRUCIAL : Récupère le type de marchandise de détail en base de données pour effacer les mentions figées
  const getUniteDetailName = () => {
    if (!formData.unite_id) return "unité(s)";
    const ut = unites.find(u => String(u.id || u.ID) === String(formData.unite_id));
    
    const ref = ut ? (ut.unite_reference || ut.UNITE_REFERENCE) : (formData.unite_reference || formData.UNITE_REFERENCE);
    return ref ? String(ref).toLowerCase() : "unité(s)";
  };

  // --- LOGIQUE DE CALCUL PAR CASIER ---
  const pAchat = parseFloat(formData.cmp) || 0;
  const pVente = parseFloat(formData.prixVente) || 0;
  const margeBrute = pVente - pAchat;
  const tauxMarge = pAchat > 0 ? (margeBrute / pAchat) * 100 : 0;

  // --- ✅ GESTION DYNAMIQUE DES PALIERS ---
  const ajouterPalier = () => {
    setFormData(prev => ({
      ...prev,
      paliers: [...prev.paliers, { id_temp: Date.now(), quantite: '', prix_total: '' }]
    }));
  };

  const modifierPalier = (index, field, value) => {
    setFormData(prev => {
      const nouveauxPaliers = [...prev.paliers];
      
      // 🚀 SÉCURISATION LOGISTIQUE : Si le champ est la quantité, on stocke la chaîne brute (ex: "5 + 2") 
      // pour permettre la saisie du signe "+" sans être coupé par un parseFloat.
      if (field === 'quantite') {
        nouveauxPaliers[index][field] = value;
      } else {
        nouveauxPaliers[index][field] = value === '' ? '' : parseFloat(value);
      }
      
      return { ...prev, paliers: nouveauxPaliers };
    });
  };

  const deletePalier = (index) => {
    setFormData(prev => ({
      ...prev,
      paliers: prev.paliers.filter((_, i) => i !== index)
    }));
  };

  // ✅ FONCTION DE CHARGEMENT STABILISÉE
  const loadInitialData = useCallback(async () => {
    try {
      const invRes = await API.get('/inventories/check-status');
      const active = !!invRes.data.en_cours;
      setIsInventoryActive(active);
      
      if (active) {
        showMsg("⚠️ SYSTÈME GELÉ : Un inventaire est en cours. Modification impossible.", "error");
      }

      const [fRes, cRes, gRes, uRes] = await Promise.all([
        API.get('/articles/familles').catch(() => ({ data: [] })),
        API.get('/articles/categories').catch(() => ({ data: [] })),
        API.get('/articles/groups').catch(() => ({ data: [] })),
        API.get('/unites').catch(() => ({ data: [] })),
      ]);

      setFamilles(Array.isArray(fRes.data) ? fRes.data.filter(f => f.is_active === 1) : []);
      setCategories(Array.isArray(cRes.data) ? cRes.data.filter(c => c.is_active === 1) : []);
      setGroupes(Array.isArray(gRes.data) ? gRes.data.filter(g => g.is_active === 1) : []);

      const rawUnites = Array.isArray(uRes.data) ? uRes.data : (uRes.data?.unites || uRes.data?.data || []);
      // Filtrage et stockage des unités avec leurs coefficients intégrés
      setUnites(Array.isArray(rawUnites) ? rawUnites.filter(u => u.is_active !== 0) : []);

      if (id) {
        const res = await productAPI.getById(id);

        if (res.data) {
          const art = res.data;
          const listPaliers = art.paliers || [];
          
          let cleanedData = { 
            ...art, 
            // 🚀 ALIGNEMENT LOGISTIQUE : Les quantités des paliers restent des types String 
            // pour tolérer l'écriture ou la lecture d'expressions sans bloquer le clavier
            paliers: listPaliers.map(p => ({
              id_temp: p.id_temp || p.id,
              quantite: p.quantite !== undefined ? String(p.quantite) : '',
              prix_total: p.prix_total
            })),
            palierActive: listPaliers.length > 0 ? 1 : 0 
          };
          cleanedData.id_article = art.id_article || art.id;

          // 🚀 ALIGNEMENT ANTI-LITIGE : Si le backend fournit un stock formaté textuel (ex: "21 + 7"),
          // on l'injecte en priorité dans l'input pour préserver l'affichage combiné natif
          if (art.stock_formate || art.stock_physique_formate) {
            cleanedData.stock_actuel = String(art.stock_formate || art.stock_physique_formate);
          } else if (art.stock_actuel !== undefined) {
            cleanedData.stock_actuel = String(art.stock_actuel);
          }

          if (art.stockAlerte !== undefined || art.stock_alerte !== undefined) {
            cleanedData.stockAlerte = String(art.stockAlerte || art.stock_alerte || '0');
          }

          Object.keys(cleanedData).forEach(key => {
            if (cleanedData[key] === null || cleanedData[key] === undefined) {
              cleanedData[key] = '';
            }
            if (key.includes('Date') && cleanedData[key]) {
              cleanedData[key] = cleanedData[key].split('T')[0];
            }
          });

          setFormData(cleanedData);
          if (art.famille_id) setSelFamille(String(art.famille_id));
          if (art.category_id) setSelCategorie(String(art.category_id));
        }
      }
    } catch (e) {
      console.error("❌ Erreur chargement données:", e);
      showMsg("Erreur lors du chargement des données", "error");
    }
  }, [id]);

  // ✅ TEMPS RÉEL & INITIALISATION
  useEffect(() => {
    loadInitialData();

    const userData = JSON.parse(localStorage.getItem('user'));
    if (socket && userData?.company_id) {
      const room = String(userData.company_id);
      socket.emit('join_company', room);

      socket.on('DATA_EVENT', (event) => {
        if (event.table === 'inventory') {
          console.log("📢 Signal inventaire reçu, actualisation du verrou...");
          loadInitialData();
        }

        if (['familles', 'categories', 'groups', 'unites', 'product_paliers'].includes(event.table)) {
          loadInitialData();
        }

        if (isEditMode && event.table === 'products' && String(event.id) === String(id)) {
          showMsg("⚠️ Cet article a été mis à jour ailleurs.", "error");
          loadInitialData(); 
        }
      });
    }
    return () => {
      if (socket) socket.off('DATA_EVENT');
    };
  }, [id, socket, loadInitialData, isEditMode]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(p => ({ 
      ...p, 
      // 🚀 PROTECTION ANTI-LITIGE : On laisse la valeur textuelle brute passer intacte 
      // pour le stock_actuel, stockAlerte et les expressions combinées
      [name]: type === 'checkbox' ? (checked ? 1 : 0) : value 
    }));
  };

  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      setFormData(p => ({ ...p, image_path: file.name }));
      const reader = new FileReader();
      reader.onloadend = () => setImagePreview(reader.result);
      reader.readAsDataURL(file);
    }
  };
  const handleSubmit = async (e) => {
    e.preventDefault();

    // 🛡️ VERROU DE SÉCURITÉ : Empêche la soumission si l'inventaire est en cours
    if (isInventoryActive) {
        showMsg("🛑 OPÉRATION REFUSÉE : Un inventaire est en cours. Vous ne pouvez pas modifier ou créer d'articles pour le moment.", "error");
        return;
    }

    // 🚀 ALIGNEMENT LOGISTIQUE : Les paliers doivent envoyer leurs chaînes textuelles brutes (ex: "5 + 2")
    // pour que conversestock.calculerUnitesNatives côté backend fasse la conversion sans tronquer.
    const paliersNettoyes = formData.palierActive === 1
      ? (formData.paliers || [])
          .filter(p => p.quantite !== '' && p.prix_total !== '')
          .map(p => ({
            quantite: String(p.quantite).trim(), // 🌟 Envoyer la chaîne textuelle intacte au backend
            prix_total: parseFloat(p.prix_total) || 0
          }))
      : []; 

    // Nettoyage des dates pour SQLite (Éviter les strings vides "")
    const payload = {
      ...formData,
      id: isEditMode ? id : formData.id_article,
      famille_id: selFamille,
      category_id: selCategorie,
      unite_id: formData.unite_id,
      is_configured: 1,
      nom: formData.nom.toUpperCase(),
      paliers: paliersNettoyes, 
      r1DateDebut: formData.r1IsPromo && formData.r1DateDebut ? formData.r1DateDebut : null,
      r1DateFin: formData.r1IsPromo && formData.r1DateFin ? formData.r1DateFin : null,
      r2DateDebut: formData.r2IsPromo && formData.r2DateDebut ? formData.r2DateDebut : null,
      r2DateFin: formData.r2IsPromo && formData.r2DateFin ? formData.r2DateFin : null,
      r3DateDebut: formData.r3IsPromo && formData.r3DateDebut ? formData.r3DateDebut : null,
      r3DateFin: formData.r3IsPromo && formData.r3DateFin ? formData.r3DateFin : null,
      r4DateDebut: formData.r4IsPromo && formData.r4DateDebut ? formData.r4DateDebut : null,
      r4DateFin: formData.r4IsPromo && formData.r4DateFin ? formData.r4DateFin : null,
    };

    // Conversion sélective des types numériques pour SQLite
    // 🌟 SÉCURISATION CRITIQUE : 'stockAlerte' et 'stock_actuel' sont retirés de cette liste 
    // pour préserver le symbole "+" et les saisies combinées textuelles.
    const numFields = [
      'cmp', 'prixVente', 'taxeTaux', 'remiseActive', 'taxeActive', 'is_active', 'palierActive',
      'r1Active', 'r1Seuil', 'r1Montant', 'r1Taux', 'r1IsPromo',
      'r2Active', 'r2Seuil', 'r2Montant', 'r2Taux', 'r2IsPromo',
      'r3Active', 'r3Multiple', 'r3Montant', 'r3Taux', 'r3IsPromo',
      'r4Active', 'r4A_Max', 'r4A_Montant', 'r4A_Taux', 'r4B_Max', 'r4B_Montant', 'r4B_Taux', 'r4C_Montant', 'r4C_Taux', 'r4IsPromo'
    ];
    
    numFields.forEach(f => { 
      if (payload[f] !== undefined) {
        payload[f] = parseFloat(payload[f]) || 0;
      }
    });

    // 🚀 PROTECTION ANTI-LITIGE CENTRALISÉE : 
    // On force l'envoi sous forme de chaînes textuelles propres. Les multiplicateurs logistiques
    // sont désormais gérés de manière unique par le serveur (Bloc 1 et Bloc 2) pour éviter les écarts.
    payload.stock_actuel = String(formData.stock_actuel || '0').trim();
    payload.stock_alerte = String(formData.stockAlerte || formData.stock_alerte || '0').trim();

    try {
      if (isEditMode) {
        await productAPI.update(id, payload); 
        showMsg("✅ Article mis à jour et synchronisé !");
        
        // 🚀 REDIRECTION VERS LE HUB/LISTE DES ARTICLES APRÈS MODIFICATION
        setTimeout(() => {
          navigate('/admin/articles'); 
        }, 1500);

      } else {
        // ✨ COMPORTEMENT CRÉATION : Laisse la page disponible pour un nouvel enregistrement
        await productAPI.create(payload);
        showMsg("✅ Nouvel article créé et diffusé !");
        resetForm();
      }
    } catch (err) {
      showMsg("❌ " + (err.response?.data?.error || err.message), 'error');
    }
  };

  const PromoSection = ({ sectionId }) => (
    <div style={{ marginTop: '8px', padding: '8px', background: '#f8fafc', borderRadius: '5px', border: '1px solid #e2e8f0' }}>
      <label style={{ fontSize: '11px', display: 'flex', alignItems: 'center', gap: '5px', cursor: 'pointer', color: '#1e293b' }}>
        <input type="checkbox" name={`${sectionId}IsPromo`} checked={formData[`${sectionId}IsPromo`] === 1} onChange={handleChange} />
        <b>Dates Promo</b>
      </label>
      {formData[`${sectionId}IsPromo`] === 1 && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '5px', marginTop: '8px' }}>
          <div><span style={{fontSize:'9px'}}>Début</span><input type="date" name={`${sectionId}DateDebut`} style={inp} value={formData[`${sectionId}DateDebut`] || ''} onChange={handleChange} /></div>
          <div><span style={{fontSize:'9px'}}>Fin</span><input type="date" name={`${sectionId}DateFin`} style={inp} value={formData[`${sectionId}DateFin`] || ''} onChange={handleChange} /></div>
        </div>
      )}
    </div>
  );

  return (
    <div className="dashboard-layout" style={{ height: '100vh', overflow: 'hidden', display: 'flex' }}>
      {/* NOTIFICATION ANIMÉE */}
      {notification.show && (
        <div style={{
          position: 'fixed', top: '20px', right: '20px', zIndex: 9999, padding: '12px 20px', borderRadius: '8px',
          backgroundColor: notification.type === 'success' ? '#059669' : '#dc2626',
          color: 'white', fontWeight: 'bold', display: 'flex', alignItems: 'center', gap: '10px', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          animation: 'slideIn 0.3s forwards'
        }}>
          {notification.type === 'success' ? <CheckCircle size={18}/> : <XCircle size={18}/>}
          {notification.message}
        </div>
      )}

      <Sidebar />
      <main className="main-area" style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f1f5f9', height: '100vh', overflow: 'hidden' }}>
        
               {/* EN-TÊTE COMPLÈTEMENT FIGÉ */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '20px 20px 10px 20px', flexShrink: 0 }}>
          <button type="button" onClick={() => navigate(-1)} style={{ border: 'none', background: '#fff', padding: '8px', borderRadius: '50%', cursor: 'pointer', boxShadow: '0 2px 4px rgba(0,0,0,0.1)' }}><ArrowLeft size={16}/></button>
          <h2 style={{ fontSize: '18px', margin: 0, fontWeight: '800' }}>
            {isEditMode ? `MODIFIER : ${formData.id_article || formData.id || ''}` : "NOUVEAU PRODUIT"}
          </h2>
        </div>

        {/* ✅ ENVELOPPE DE PAGE SANS SCROLL : Contraint le formulaire à rester dans les limites de l'écran */}
        <div style={{ flex: 1, overflow: 'hidden', padding: '0 20px 20px 20px' }}>
          <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 380px', gap: '20px', height: 'calc(100vh - 80px)', overflow: 'hidden' }}>
            
            {/* ✅ ZONE GAUCHE AUTONOME : Gère son propre défilement vertical */}
            <div className="left-column" style={{ height: '100%', overflowY: 'auto', paddingRight: '6px', display: 'flex', flexDirection: 'column' }}>
              {/* IDENTIFICATION */}
              <div style={{ ...card, flexShrink: 0 }}>
                <div style={{ display: 'flex', gap: '8px', color: '#2563eb', marginBottom: '12px' }}><Package size={18}/> <b>Identification & Image</b></div>
                <div style={{ display: 'flex', gap: '20px', marginBottom: '15px' }}>
                  <div style={{ width: '120px', height: '120px', border: '2px dashed #cbd5e1', borderRadius: '10px', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: '#f8fafc', cursor: 'pointer' }} onClick={() => document.getElementById('imgInp').click()}>
                    {imagePreview ? <img src={imagePreview} style={{width:'100%', height:'100%', objectFit:'cover'}} alt="Preview" /> : <ImageIcon size={30} color="#cbd5e1"/>}
                    <input type="file" id="imgInp" hidden accept="image/*" onChange={handleImageChange} />
                  </div>
                  <div style={{ flex: 1, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <div style={{gridColumn: 'span 2'}}>
                      <label style={lbl}><Hash size={10} style={{marginRight:4}}/> ID Article (Automatique)</label>
                      <input value={formData.id_article || ''} style={{...inp, background: '#f8fafc', color: '#64748b', fontWeight: 'bold'}} readOnly />
                    </div>
                    <div style={{gridColumn: 'span 2'}}><label style={lbl}>Nom de l'article</label><input required name="nom" value={formData.nom || ''} style={{...inp, fontWeight:'bold'}} onChange={e => setFormData({...formData, nom: e.target.value.toUpperCase()})}/></div>
                    <div><label style={lbl}>Code Barre</label><input name="codeBarre" value={formData.codeBarre || ''} placeholder="Code..." style={inp} onChange={handleChange}/></div>
                    <div>
                      <label style={lbl}>Unité de Mesure</label>
                      <select 
                        name="unite_id" 
                        style={inp} 
                        value={formData.unite_id || ''} 
                        onChange={handleChange}
                        required
                      >
                        <option value="">Choisir...</option>
                        {unites && unites.map(u => {
                          const nomUnite = u.libelle || u.LIBELLE || u.nom || `Unité n°${u.id}`;
                          const codeUnite = u.code || u.CODE ? ` (${u.code || u.CODE})` : '';
                          const coeffText = u.coefficient || u.COEFFICIENT ? ` [x${u.coefficient || u.COEFFICIENT}]` : '';
                          
                          return (
                            <option key={u.id || u.ID} value={u.id || u.ID}>
                              {nomUnite}{codeUnite}{coeffText}
                            </option>
                          );
                        })}
                      </select>
                      
                      {/* 🌟 FILTRE DE RENDU DYNAMIQUE AMÉLIORÉ DE L'UNITÉ DE DÉTAIL */}
                      {formData.unite_id && (
                        <span style={{ fontSize: '10px', color: '#2563eb', fontWeight: 'bold', display: 'block', marginTop: '4px' }}>
                          ℹ️ Multiplicateur : 1 {unites.find(u => String(u.id || u.ID) === String(formData.unite_id))?.code || 'CS'} = {getCoeffActuel()} {getUniteDetailName()}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

{/* STRUCTURE DETECTABLE ET HERMETIQUE */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
                  <div><label style={lbl}>Famille</label>
                      <select style={inp} value={selFamille} onChange={e => {setSelFamille(e.target.value); setSelCategorie('')}}>
                          <option value="">Choisir...</option>
                          {familles.map(f=><option key={f.id || f.ID} value={f.id || f.ID}>{f.nom || f.NOM}</option>)}
                      </select>
                  </div>
                  <div><label style={lbl}>Catégorie</label>
                      <select style={inp} value={selCategorie} disabled={!selFamille} onChange={e => setSelCategorie(e.target.value)}>
                          <option value="">Choisir...</option>
                          {categories.filter(c => String(c.famille_id || c.FAMILLE_ID) === String(selFamille)).map(c=><option key={c.id || c.ID} value={c.id || c.ID}>{c.nom || c.NOM}</option>)}
                      </select>
                  </div>
                  <div><label style={lbl}>Groupe</label>
                      <select name="group_id" style={inp} value={formData.group_id} disabled={!selCategorie} onChange={handleChange}>
                          <option value="">Choisir...</option>
                          {groupes.filter(g => String(g.category_id || g.CATEGORY_ID) === String(selCategorie)).map(g=><option key={g.id || g.ID} value={g.id || g.ID}>{g.nom || g.NOM}</option>)}
                      </select>
                  </div>
                </div>
              </div>

          {/* 🖥️ CONTAINER DE DISPOSITION CÔTE À CÔTE PARFAITEMENT SYNCHRONISÉ ET COMPACT */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px', marginTop: '20px', alignItems: 'stretch' }}>
            {/* PALIERS DE VENTE CONDITIONNELS (Colonne Gauche) */}
            {/* ✅ AJUSTEMENT COMPACT : Alignement strict des hauteurs avec le bloc de droite pour figer l'écran */}
            <div style={{ ...card, marginBottom: 0, height: 'calc(100vh - 380px)', minHeight: '400px', display: 'flex', flexDirection: 'column', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                <b style={{ color: '#10b981', display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px' }}><DollarSign size={16}/> Paliers de vente conditionnels</b>
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                  <label style={{ fontSize: '11px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <input type="checkbox" name="palierActive" checked={formData.palierActive === 1} onChange={handleChange} /> MODULE ACTIF
                  </label>
                  {formData.palierActive === 1 && (
                    <button 
                      type="button" 
                      onClick={ajouterPalier} 
                      style={{ display: 'flex', alignItems: 'center', gap: '4px', background: '#10b981', color: 'white', border: 'none', padding: '4px 8px', borderRadius: '5px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' }}
                    >
                      <Plus size={12}/> Ajouter un palier
                    </button>
                  )}
                </div>
              </div>

{formData.palierActive === 1 && (
                /* Zone scrollable locale : Compactée pour éviter tout débordement de l'écran global */
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {(!formData.paliers || formData.paliers.length === 0) && (
                    <div style={{ textAlign: 'center', padding: '15px', color: '#94a3b8', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '6px', background: '#f8fafc' }}>
                      Aucun palier configuré. Cliquez sur le bouton pour ajouter une ligne de quantité.
                    </div>
                  )}

                  {formData.paliers && formData.paliers.map((palier, index) => {
                    // 🚀 PROTECTION ANTI-LITIGE : Calcul de l'équivalence prenant en compte les chaînes composées
                    const chaineBrute = String(palier.quantite || '').trim();
                    const coeffActuel = getCoeffActuel();
                    let unitesDetailEquivalentes = 0;

                    if (chaineBrute.includes('+')) {
                      const parties = chaineBrute.split('+');
                      const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                      const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                      unitesDetailEquivalentes = Math.round(gros * coeffActuel) + Math.round(detail);
                    } else {
                      unitesDetailEquivalentes = Math.round((parseFloat(chaineBrute.replace(',', '.')) || 0) * coeffActuel);
                    }

                    const qteSaisie = unitesDetailEquivalentes; // Aligne la condition d'affichage du badge avec la valeur calculée

                    return (
                      <div key={palier.id_temp || index} style={{ display: 'flex', flexDirection: 'column', background: '#f8fafc', padding: '6px 10px', borderRadius: '6px', border: '1px solid #e2e8f0', flexShrink: 0, gap: '4px' }}>
                        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                          <div style={{ flex: 1 }}>
                            <label style={lbl}>Quantité requise ({formData.code || 'Unités'})</label>
                            {/* 🌟 PASSAGE TEXTE : Permet d'écrire l'expression combinée sans bloquer le clavier */}
                            <input 
                              type="text" 
                              placeholder="Ex: 21 + 7 ou 5" 
                              value={palier.quantite || ''} 
                              style={{ ...inp, padding: '3px 6px', fontSize: '12px' }} 
                              onChange={(e) => modifierPalier(index, 'quantite', e.target.value)} 
                              required 
                            />
                          </div>
                          <div style={{ flex: 1 }}>
                            <label style={lbl}>Prix total du lot (F CFA)</label>
                            <input 
                              type="number" 
                              step="0.1" 
                              placeholder="Ex: 1600" 
                              value={palier.prix_total || ''} 
                              style={{ ...inp, padding: '3px 6px', fontSize: '12px' }} 
                              onChange={(e) => modifierPalier(index, 'prix_total', e.target.value)} 
                              required 
                            />
                          </div>
                          <div style={{ marginTop: '14px' }}>
                            <button 
                              type="button" 
                              onClick={() => deletePalier(index)} 
                              style={{ background: '#fee2e2', color: '#ef4444', border: 'none', padding: '5px 8px', borderRadius: '5px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                            >
                              <Trash2 size={14}/>
                            </button>
                          </div>
                        </div>
                        {/* 🌟 ZONE PARFAITEMENT DYNAMISÉE : Plus aucune mention fixe "bouteille" ou "liquide" */}
                        {qteSaisie > 0 && (
                          <div style={{ fontSize: '10px', color: '#059669', fontWeight: '700', paddingLeft: '2px' }}>
                            👉 Correspond à : {unitesDetailEquivalentes} {getUniteDetailName()}(s) en stock.
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

{formData.palierActive !== 1 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', padding: '15px', color: '#94a3b8', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '6px', background: '#f8fafc', width: '100%' }}>
                    Aucun palier configuré. L'article se vendra uniquement au tarif public unitaire de base.
                  </div>
                </div>
              )}
            </div>

            {/* REMISES AUTOMATIQUES (Colonne Droite) */}
            {/* ✅ AJUSTEMENT COMPACT : Hauteur maximale calculée réduite pour s'intégrer sans pousser l'écran vers le bas */}
            <div style={{ ...card, marginBottom: 0, height: 'calc(100vh - 380px)', minHeight: '400px', display: 'flex', flexDirection: 'column', padding: '12px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px', flexShrink: 0 }}>
                <b style={{ color: '#f59e0b', display:'flex', alignItems:'center', gap:'8px', fontSize: '13px' }}><Percent size={16}/> Remises Automatiques</b>
                <label style={{ fontSize: '11px', fontWeight:'700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <input type="checkbox" name="remiseActive" checked={formData.remiseActive===1} onChange={handleChange}/> MODULE ACTIF
                </label>
              </div>

              {formData.remiseActive === 1 && (
                /* ✅ ZERO SCROLL INUTILE : On passe en overflow: hidden et flex-shrink pour forcer le figeage parfait */
                <div style={{ flex: 1, overflowY: 'auto', paddingRight: '4px', display: 'grid', gridTemplateColumns: '1fr', gap: '8px' }}>
                  {['r1', 'r2', 'r3'].map((r, i) => {
                    const chaineBrute = String(formData[`${r}${r==='r3'?'Multiple':'Seuil'}`] || '').trim();
                    const coeffActuel = getCoeffActuel();
                    let unitsRemiseEquiv = 0;

                    if (chaineBrute.includes('+')) {
                      const parties = chaineBrute.split('+');
                      const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                      const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                      unitsRemiseEquiv = Math.round(gros * coeffActuel) + Math.round(detail);
                    } else {
                      unitsRemiseEquiv = Math.round((parseFloat(chaineBrute.replace(',', '.')) || 0) * coeffActuel);
                    }

                    return (
                      <div key={r} style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff', flexShrink: 0, display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <label style={{ fontSize: '11px', fontWeight: '800', display:'flex', gap:'5px', marginBottom:'4px', cursor: 'pointer' }}>
                          <input type="checkbox" name={`${r}Active`} checked={formData[`${r}Active`]===1} onChange={handleChange}/> 
                          {r.toUpperCase()} : {['Seuil','Gros','Multiple'][i]}
                        </label>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '5px' }}>
                          {/* 🌟 TYPE TEXT : Autorise la saisie combinée native sur les déclencheurs de remises R1-R3 */}
                          <input name={`${r}${r==='r3'?'Multiple':'Seuil'}`} placeholder="Qté" type="text" style={{ ...inp, padding: '3px 6px', fontSize: '12px' }} value={formData[`${r}${r==='r3'?'Multiple':'Seuil'}`] || ''} onChange={handleChange}/>
                          <input name={`${r}Montant`} placeholder="Remise F" type="number" style={{ ...inp, padding: '3px 6px', fontSize: '12px' }} value={formData[`${r}Montant`] || ''} onChange={handleChange}/>
                          <input name={`${r}Taux`} placeholder="%" type="number" style={{ ...inp, padding: '3px 6px', fontSize: '12px' }} value={formData[`${r}Taux`] || ''} onChange={handleChange}/>
                        </div>
                        {/* 🌟 ZONE CORRIGÉE : Traducteur d'activation dynamique de la remise sans mention fixe */}
                        {unitsRemiseEquiv > 0 && formData[`${r}Active`] === 1 && (
                          <div style={{ fontSize: '10px', color: '#f59e0b', fontWeight: '700', paddingLeft: '2px' }}>
                            ⚠️ Déclenchement à : {unitsRemiseEquiv} {getUniteDetailName()}(s) vendue(s).
                          </div>
                        )}
                        <PromoSection sectionId={r} />
                      </div>
                    );
                  })}

                  {/* R4 : Grille Quantitative */}
                  <div style={{ padding: '6px 10px', border: '1px solid #e2e8f0', borderRadius: '6px', background: '#ffffff', flexShrink: 0 }}>
                    <label style={{ fontSize: '11px', fontWeight: '800', marginBottom:'4px', display:'flex', gap:'5px', cursor: 'pointer' }}>
                        <input type="checkbox" name="r4Active" checked={formData.r4Active===1} onChange={handleChange}/> R4 : Grille Quantitative
                    </label>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
                      {['A', 'B', 'C'].map((p) => {
                        return (
                          <div key={p} style={{background:'#f1f5f9', padding:'2px 4px', borderRadius:'4px'}}>
                            <span style={{fontSize: '8px', fontWeight: '700', display: 'block', marginBottom: '1px', textAlign: 'center'}}>PALIER {p}</span>
                            
                            {/* 🌟 TYPE TEXT : Permet les expressions d'équivalences de gros+détail sur la grille de volume R4 */}
                            <input 
                              name={`r4${p}_Max`} 
                              placeholder={p === 'C' ? "Min Qté" : "Max Qté"} 
                              type="text" 
                              style={{...inp, fontSize:'10px', marginBottom:'2px', padding:'3px'}} 
                              value={formData[`r4${p}_Max`] || ''} 
                              onChange={handleChange}
                            />
                            
                            <input 
                              name={`r4${p}_Montant`} 
                              placeholder="F" 
                              type="number" 
                              style={{...inp, fontSize:'10px', padding:'3px', marginBottom:'2px'}} 
                              value={formData[`r4${p}_Montant`] || ''} 
                              onChange={handleChange}
                            />
                            
                            <input 
                              name={`r4${p}_Taux`} 
                              placeholder="%" 
                              type="number" 
                              style={{...inp, fontSize:'10px', padding:'3px'}} 
                              value={formData[`r4${p}_Taux`] || ''} 
                              onChange={handleChange}
                            />
                            
                            {p === 'C' && <div style={{fontSize:'8px', color:'#94a3b8', textAlign:'center', marginTop: '1px'}}>Et plus</div>}
                          </div>
                        );
                      })}
                    </div>
                    {/* 🌟 ZONE CORRIGÉE : Traducteur dynamique des seuils quantitatifs R4 en unités de détail réelles */}
                    {formData.r4Active === 1 && (formData.r4A_Max || formData.r4B_Max || formData.r4C_Max) && (
                      <div style={{ fontSize: '9px', color: '#64748b', marginTop: '6px', background: '#f8fafc', padding: '4px', borderRadius: '4px', border: '1px dashed #cbd5e1' }}>
                        ℹ️ <strong>Seuils en stock :</strong> {formData.r4A_Max ? `A: max ${String(formData.r4A_Max).includes('+') ? 'combiné' : Math.round((parseFloat(String(formData.r4A_Max).replace(',','.')) || 0) * getCoeffActuel())} ${getUniteDetailName()} | ` : ''}{formData.r4B_Max ? `B: max ${String(formData.r4B_Max).includes('+') ? 'combiné' : Math.round((parseFloat(String(formData.r4B_Max).replace(',','.')) || 0) * getCoeffActuel())} ${getUniteDetailName()} | ` : ''}{formData.r4C_Max ? `C: min ${String(formData.r4C_Max).includes('+') ? 'combiné' : Math.round((parseFloat(String(formData.r4C_Max).replace(',','.')) || 0) * getCoeffActuel())} ${getUniteDetailName()}` : ''}
                      </div>
                    )}
                    <PromoSection sectionId="r4" />
                  </div>
                </div>
              )}

              {formData.remiseActive !== 1 && (
                <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <div style={{ textAlign: 'center', padding: '15px', color: '#94a3b8', fontSize: '12px', border: '1px dashed #e2e8f0', borderRadius: '6px', background: '#f8fafc', width: '100%' }}>
                    Aucune remise automatique activée pour cet article.
                  </div>
                </div>
              )}
            </div>
          </div> </div>


      {/* COLONNE DROITE : PRIX & ACTIONS */}
          <div className="right-column" style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ ...card, borderTop: '4px solid #10b981', marginBottom: 0 }}>
              <div style={{ color: '#10b981', marginBottom: '15px', display:'flex', alignItems:'center', gap:'8px' }}><DollarSign size={18}/> <b>Prix & Marge</b></div>
              <label style={lbl}>Prix d'Achat (CMP)</label>
  
              <input 
                name="cmp" 
                type="number" 
                value={formData.cmp || ''} 
                disabled={isInventoryActive} // 🔥 Désactive le champ
                style={{
                  ...inp, 
                  marginBottom: '10px',
                  background: isInventoryActive ? '#f1f5f9' : '#fff', // Fond gris si bloqué
                  cursor: isInventoryActive ? 'not-allowed' : 'text'
                }} 
                onChange={handleChange}
              />

              <label style={lbl}>Prix de Vente Public</label>
              <input 
                required 
                name="prixVente" 
                type="number" 
                value={formData.prixVente || ''} 
                disabled={isInventoryActive} // 🔥 Désactive le champ
                style={{
                  ...inp, 
                  fontSize: '18px', 
                  fontWeight: '900', 
                  color: isInventoryActive ? '#94a3b8' : '#0f172a', // Texte grisé si bloqué
                  background: isInventoryActive ? '#f1f5f9' : '#fff',
                  cursor: isInventoryActive ? 'not-allowed' : 'text'
                }} 
                onChange={handleChange}
              />

              {/* 🌟 ZONE PARFAITEMENT DYNAMISÉE : Calculateur en temps réel du prix de revient de détail (Zéro mot figé) */}
              {pVente > 0 && formData.unite_id && getCoeffActuel() > 1 && (
                <div style={{ fontSize: '11px', color: '#2563eb', fontWeight: '700', marginTop: '4px', background: '#eff6ff', padding: '6px', borderRadius: '6px', border: '1px solid #bfdbfe' }}>
                  👉 Soit : {(pVente / getCoeffActuel()).toFixed(0)} F CFA la {getUniteDetailName()} au détail.
                </div>
              )}

              <div style={{ marginTop: '15px', padding: '12px', background: margeBrute >= 0 ? '#f0fdf4' : '#fef2f2', borderRadius: '8px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Marge Brute:</span>
                    <strong style={{ color: margeBrute >= 0 ? '#15803d' : '#dc2626' }}>{(margeBrute || 0).toLocaleString()} F</strong>
                </div>
                <div style={{ display:'flex', justifyContent:'space-between' }}>
                    <span style={{ fontSize: '11px', color: '#64748b' }}>Taux de Marge:</span>
                    <strong style={{ color: tauxMarge >= 20 ? '#15803d' : '#f59e0b' }}>{(tauxMarge || 0).toFixed(1)} %</strong>
                </div>
              </div>
            </div>

            <div style={{ ...card, marginBottom: 0 }}>
              <div style={{ color: '#64748b', marginBottom: '12px', display:'flex', alignItems:'center', gap:'8px' }}><ShieldCheck size={18}/> <b>Stock & Taxes</b></div>
              
              <label style={lbl}>Seuil d'Alerte Stock (en {formData.unite_code || 'Lots/Casiers'})</label>
              {/* 🌟 PASSAGE EN TYPE TEXT : Permet la détection du mode combiné sur l'alerte stock */}
              <input 
                name="stockAlerte" 
                type="text" 
                placeholder="Ex: 5 ou 1 + 6"
                style={{...inp, marginBottom:'4px'}} 
                value={formData.stockAlerte || ''} 
                onChange={handleChange}
              />
              
              {/* 🌟 EVALUATION LOGISTIQUE DE L'ALERTE : Découpage pour l'affichage informatif de sécurité */}
              {(() => {
                const chaineBrute = String(formData.stockAlerte || '').trim();
                const coeffActuel = getCoeffActuel();
                let AlerteDetailEquiv = 0;

                if (chaineBrute.includes('+')) {
                  const parties = chaineBrute.split('+');
                  const gros = parseFloat(String(parties[0]).replace(',', '.').trim()) || 0;
                  const detail = parseFloat(String(parties[1]).replace(',', '.').trim()) || 0;
                  AlerteDetailEquiv = Math.round(gros * coeffActuel) + Math.round(detail);
                } else {
                  AlerteDetailEquiv = Math.round((parseFloat(chaineBrute.replace(',', '.')) || 0) * coeffActuel);
                }

                return AlerteDetailEquiv > 0 && formData.unite_id ? (
                  <div style={{ fontSize: '10px', color: '#dc2626', fontWeight: '700', marginBottom: '15px', paddingLeft: '2px' }}>
                    ⚠️ Alerte déclenchée dès que le stock descend sous : {AlerteDetailEquiv} {getUniteDetailName()}(s).
                  </div>
                ) : null;
              })()}
              
              <div style={{ padding: '10px', background: '#f8fafc', border:'1px solid #e2e8f0', borderRadius: '8px', marginTop: '11px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center'}}>
                    <label style={{...lbl, margin:0}}>Produit Taxable ?</label>
                    <input type="checkbox" name="taxeActive" checked={formData.taxeActive===1} onChange={handleChange}/>
                </div>
                {formData.taxeActive === 1 && (
                  <div style={{ marginTop: '10px', borderTop: '1px solid #e2e8f0', paddingTop: '10px' }}>
                    <label style={lbl}>Taux de TVA (%)</label>
                    <input name="taxeTaux" type="number" value={formData.taxeTaux || ''} style={inp} onChange={handleChange}/>
                  </div>
                )}
              </div>
            </div>



                        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <button 
                type="submit" 
                disabled={isInventoryActive} // 🛡️ Désactivation physique lors des inventaires
                style={{ 
                  width: '100%', 
                  padding: '15px', 
                  background: isInventoryActive ? '#cbd5e1' : '#0f172a', // Gris si bloqué
                  color: '#fff', 
                  border: 'none', 
                  borderRadius: '10px', 
                  fontWeight: '800', 
                  cursor: isInventoryActive ? 'not-allowed' : 'pointer', 
                  display: 'flex', 
                  alignItems: 'center', 
                  justifyContent: 'center', 
                  gap: '10px' 
                }}
              >
                {isInventoryActive ? (
                  <><ShieldCheck size={20}/> SYSTÈME GELÉ</> 
                ) : (
                  <><Save size={20}/> {isEditMode ? "METTRE À JOUR" : "ENREGISTRER L'ARTICLE"}</>
                )}
              </button>
              
              <button type="button" onClick={() => navigate('/admin/articles')} style={{ width: '100%', padding: '12px', background: '#fff', color: '#64748b', border: '1px solid #cbd5e1', borderRadius: '10px', fontWeight: '600', cursor: 'pointer' }}>
                ANNULER / RETOUR
              </button>
            </div>
          </div>
        </form>
      </div> {/* Fermeture de la div de défilement du formulaire initiée au Bloc 3 */}
    </main>

    <style>{`
      @keyframes slideIn {
        from { transform: translateX(100%); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `}</style>
  </div>
);
};

export default CreateArticle;
