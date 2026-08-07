import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Barcode, ShieldAlert, CheckCircle2, ArrowDownCircle, XCircle, Info } from 'lucide-react';
import Sidebar from '../../components/Sidebar';

const InventaireEmballage = () => {
  const navigate = useNavigate();
  const [articles, setArticles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchNom, setSearchNom] = useState('');
  const [searchBarcode, setSearchBarcode] = useState('');
  const [articleEnCours, setArticleEnCours] = useState(null);
  const [qteSaisie, setQteSaisie] = useState('');
  const [dialogue, setDialogue] = useState({ show: false, titre: '', msg: '', type: 'primary', action: null });
  const inputRef = useRef(null);
  const [activeInvId, setActiveInvId] = useState(null);
  
  const API_BASE = 'http://localhost:3030/api/inventaireemb';

  const getHeaders = () => ({
    'Authorization': `Bearer ${localStorage.getItem('token')}`,
    'Content-Type': 'application/json'
  });

  useEffect(() => {
    const init = async () => {
      try {
        const res = await fetch(`${API_BASE}/active`, { headers: getHeaders() });
        if (res.status === 401) return console.error("Session expirée");
        
        const data = await res.json();
        if (data.success && data.inventory) {
          setActiveInvId(data.inventory.id);
          chargerDonnees(data.items || []);
        } else {
          chargerDonnees([]);
        }
      } catch (err) { 
        console.error("Erreur init:", err);
        chargerDonnees([]);
      }
    };
    init();
  }, []); 

  const chargerDonnees = async (itemsSauvegardes = []) => {
    setLoading(true);
    try {
      const res = await fetch(`http://localhost:3030/api/emballages`, { headers: getHeaders() });
      if (!res.ok) throw new Error("Erreur chargement emballages");
      const dataArt = await res.json();
      const listeBrute = Array.isArray(dataArt) ? dataArt : (dataArt.emballages || []);
      
      const merged = listeBrute.map(art => {
        const match = itemsSauvegardes.find(item => item.packaging_id === art.id);
        return { 
          ...art, 
          prix_unitaire: art.cmp || art.prix_achat || 0, 
          stock_reel: match !== undefined ? parseFloat(match.stock_reel) : undefined 
        };
      });
      setArticles(merged);
    } catch (err) { 
      console.error("Err charge:", err); 
    } finally { 
      setLoading(false); 
    }
  };

  // ✅ LOGIQUE TOTAUX ALIGNÉE : Écarts financiers à 0 si non compté
  const totaux = useMemo(() => {
    return articles.reduce((acc, art) => {
      const pa = parseFloat(art.cmp || art.prix_achat || art.prix_unitaire || 0);
      const qTheo = parseFloat(art.stock_actuel || 0);
      const isCompté = art.stock_reel !== undefined;
      const qReel = isCompté ? parseFloat(art.stock_reel) : qTheo;
      
      acc.valTheo += qTheo * pa;
      acc.valReel += qReel * pa;
      acc.ecartVal += (qReel - qTheo) * pa;
      
      return acc;
    }, { valTheo: 0, valReel: 0, ecartVal: 0 });
  }, [articles]);

  const selectionnerArticle = (art) => {
    setArticleEnCours(art);
    setQteSaisie(art.stock_reel !== undefined ? art.stock_reel : '');
    setTimeout(() => inputRef.current?.focus(), 100);
  };

  const enregistrerQte = async () => {
    if (!articleEnCours || qteSaisie === '') return;
    if (!activeInvId) return alert("Aucun inventaire actif.");

    const qte = parseFloat(qteSaisie);
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    const res = await fetch(`${API_BASE}/save-item`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({
        id: `INV-${activeInvId}-${articleEnCours.id}`,
        inventory_id: activeInvId,
        packaging_id: articleEnCours.id,
        nom_article_snap: articleEnCours.nom,
        prix_achat_snap: parseFloat(articleEnCours.prix_unitaire || 0),
        stock_theorique: parseFloat(articleEnCours.stock_actuel || 0),
        stock_reel: qte,
        user_id: user.id,
        company_id: user.company_id || user.companyId
      })
    });
    
    if (res.ok) {
      setArticles(prev => prev.map(a => a.id === articleEnCours.id ? { ...a, stock_reel: qte } : a));
      setArticleEnCours(null);
      setQteSaisie('');
    }
  };

  // ✅ LOGIQUE RESTE À 0 ALIGNÉE : Envoi massif asynchrone avec ID unique enrichi du timestamp
 // ✅ LOGIQUE RESTE À 0 CORRIGÉE ET SÉCURISÉE
  const mettreAZeroLeReste = async () => {
    if (!activeInvId) return;
    const user = JSON.parse(localStorage.getItem('user') || '{}');
    
    // 1. Filtrer uniquement les articles qui n'ont PAS encore été saisis (stock_reel est undefined)
    const articlesACompterZero = articles.filter(art => art.stock_reel === undefined);

    if (articlesACompterZero.length === 0) {
      return alert("Tous les articles ont déjà une quantité saisie.");
    }

    try {
      // 2. Préparation des requêtes pour tous les articles non saisis
      const promises = articlesACompterZero.map(art => 
        fetch(`${API_BASE}/save-item`, {
          method: 'POST',
          headers: getHeaders(),
          body: JSON.stringify({
            id: `INV-${activeInvId}-${art.id}`, // ID unique stable
            id_packaging_inventaire: activeInvId,
            inventory_id: activeInvId,
            packaging_id: art.id,
            nom_article_snap: art.nom,
            prix_achat_snap: parseFloat(art.prix_unitaire || 0),
            stock_theorique: parseFloat(art.stock_actuel || 0),
            stock_reel: 0, // On force le 0 ici
            user_id: user.id,
            company_id: user.company_id || user.companyId
          })
        })
      );
      
      // 3. Exécution en parallèle
      await Promise.all(promises);

      // 4. Mise à jour du state local UNIQUEMENT après succès API
      setArticles(prev => prev.map(a => ({
        ...a,
        // On transforme en 0 tous les articles qui étaient undefined
        stock_reel: a.stock_reel === undefined ? 0 : a.stock_reel
      })));
      
      console.log("Mise à zéro des articles restants terminée.");
    } catch (err) {
      console.error("Erreur lors de la mise à zéro:", err);
      alert("Une erreur est survenue lors de la mise à zéro.");
    }
  };
  const fermerDialogue = () => setDialogue({ ...dialogue, show: false });
  const ouvrirDialogue = (t, m, type, act) => setDialogue({ show: true, titre: t, msg: m, type, action: act });
  
  const annulerEtDebloquer = async () => {
    if (activeInvId) {
      await fetch(`${API_BASE}/cancel`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ inventory_id: activeInvId }) });
    }
    navigate('/emballages/inventaire');
  };
  
  const executerCloture = async () => {
    if (!activeInvId) return;
    await fetch(`${API_BASE}/validate`, { method: 'POST', headers: getHeaders(), body: JSON.stringify({ inventory_id: activeInvId }) });
    navigate('/emballages/inventaire');
  };

  const articlesFiltrés = articles.filter(a => 
    a.nom?.toLowerCase().includes(searchNom.toLowerCase()) && 
    (searchBarcode === '' || String(a.barcode || a.codeBarre || '').includes(searchBarcode))
  );


  return (
    <div style={layoutStyle}>
      <Sidebar />
      <main style={mainStyle}>
        <div style={bannerStyle}>
          <span>INVENTAIRE EMBALLAGE (ID: {activeInvId || 'NON DÉTECTÉ'})</span>
        </div>
        <div style={contentLayout}>
          <div style={leftZone}>
            <div style={searchContainer}>
              <div style={searchBox}>
                <Barcode size={20} color="#64748b"/>
                <input 
                  placeholder="Scanner..." 
                  style={searchInput} 
                  value={searchBarcode} 
                  onChange={(e) => { setSearchBarcode(e.target.value); if(e.target.value) setSearchNom(''); }}
                />
              </div>
              <div style={searchBox}>
                <Search size={20} color="#64748b"/>
                <input 
                  placeholder="Nom..." 
                  style={searchInput} 
                  value={searchNom} 
                  onChange={(e) => setSearchNom(e.target.value)}
                />
              </div>
            </div>
            <div style={tableWrapper}>
              <table style={tableStyle}>
                <thead style={theadStyle}>
                  <tr>
                    <th style={{textAlign: 'left', padding: '15px'}}>SPÉCIFICATION</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>PRIX</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>THÉORIQUE</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>COMPTÉ</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>ÉCART</th>
                    <th style={{ padding: '12px', textAlign: 'center' }}>VALEUR ÉCART</th>
                  </tr>
                </thead>
                <tbody>
                  {articlesFiltrés.map(art => {
                    const pa = parseFloat(art.prix_unitaire || 0);
                    const qTheo = parseFloat(art.stock_actuel || 0);
                    const isCompté = art.stock_reel !== undefined;
                    const qReel = isCompté ? art.stock_reel : undefined;
                    const eQte = isCompté ? qReel - qTheo : null;
                    
                    const rowStyle = { 
                        ...trStyle, 
                        background: isCompté ? '#f0f9ff' : 'white'
                    };

                    return (
                      <tr key={art.id} style={rowStyle} onClick={() => selectionnerArticle(art)}>
                        <td style={tdStyle}>
                          <div style={{fontWeight: '900', color: '#0f172a'}}>{art.nom}</div>
                          <div style={{fontSize: '10px', color: '#64748b'}}>REF: {art.codeBarre || art.id}</div>
                        </td>
                        <td style={tdCenter}>{pa.toLocaleString(undefined, {minimumFractionDigits: 2})}</td>
                        <td style={tdCenter}>{qTheo}</td>
                        {/* ✅ Remplacement de '' par '---' si l'article n'est pas encore compté */}
                        <td style={{...tdCenter, color: '#2563eb', fontWeight: '900'}}>
                          {isCompté ? qReel : '---'}
                        </td>
                        <td style={{...tdCenter, fontWeight: '900', color: eQte < 0 ? '#dc2626' : eQte > 0 ? '#16a34a' : '#475569'}}>
                          {eQte !== null ? eQte : ''}
                        </td>
                        <td style={tdCenter}>
                          {eQte !== null ? Math.round(eQte * pa).toLocaleString() : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div style={{ ...footerSummary, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '15px' }}>
              <div style={summaryBox}><span>VAL. THÉO:</span> <strong style={{ fontSize: '14px', fontWeight: '900', color: 'white', marginTop: '4px' }}>{Math.round(totaux.valTheo).toLocaleString()}</strong></div>
              <div style={summaryBox}><span>VAL. COMPTÉE:</span> <strong style={{ fontSize: '14px', fontWeight: '900', color: '#60a5fa', marginTop: '4px' }}>{Math.round(totaux.valReel).toLocaleString()}</strong></div>
              <div style={summaryBox}><span>RÉSULTAT VAL:</span> <strong style={{ fontSize: '14px', fontWeight: '900', color: totaux.ecartVal >= 0 ? '#4ade80' : '#f87171', marginTop: '4px' }}>{Math.round(totaux.ecartVal).toLocaleString()}</strong></div>
            </div>
          </div>

          <div style={rightZone}>
            <button style={btnSuccess} onClick={() => ouvrirDialogue("Clôturer ?", "Valider les stocks emballages ?", "primary", executerCloture)}>CLÔTURER</button>
            <button style={btnWarn} onClick={() => ouvrirDialogue("Confirmer", "Mettre à 0 le reste des articles emballages ?", "primary", mettreAZeroLeReste)}>RESTE À 0</button>
            <button style={btnDanger} onClick={() => ouvrirDialogue("Annuler ?", "Arrêter l'inventaire emballage ?", "danger", annulerEtDebloquer)}>ABANDONNER</button>
            
            {articleEnCours ? (
              <div style={voletSaisie}>
                <div style={{ background: '#0d9488', color: 'white', padding: '8px', fontSize: '11px', fontWeight: '900', textAlign: 'center', borderRadius: '10px 10px 0 0', margin: '-10px -10px 10px -10px' }}>SAISIE QUANTITÉ</div>
                <div style={{padding: '15px'}}>
                  <p style={{fontWeight: '900', fontSize: '12px', marginBottom: '8px'}}>{articleEnCours.nom}</p>
                  <input 
                    ref={inputRef} 
                    type="number" 
                    style={inputStyle} 
                    value={qteSaisie} 
                    onChange={(e) => setQteSaisie(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && enregistrerQte()}
                  />
                  <div style={{display: 'flex', gap: '8px'}}>
                    <button style={btnOutlineSmall} onClick={() => setArticleEnCours(null)}>RETOUR</button>
                    <button style={btnPrimarySmall} onClick={enregistrerQte}>VALIDER</button>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: '16px', padding: '20px', background: 'white' }}>
                <Info size={30} color="#cbd5e1" />
                <p style={{fontSize: '10px', marginTop: '10px', color: '#64748b', fontWeight: '900'}}>
                  CLIQUEZ SUR UN ARTICLE POUR SAISIR
                </p>
              </div>
            )}
          </div>
        </div>
      </main>

      {dialogue.show && (
        <div style={overlayStyle}>
          <div style={modalStyle}>
            <div style={modalHeader}>
              <ShieldAlert size={20} color={dialogue.type === 'danger' ? '#dc2626' : '#3b82f6'} /> 
              <span style={{fontWeight: '900', paddingLeft: '5px'}}>{dialogue.titre}</span>
            </div>
            <div style={{ padding: '20px', textAlign: 'center', fontWeight: '700' }}>{dialogue.msg}</div>
            <div style={modalFooter}>
              <button style={btnOutlineSmall} onClick={fermerDialogue}>Annuler</button>
              {/* ✅ Correction de la fonction appelée lors de la confirmation du dialogue */}
              <button 
                style={dialogue.type === 'danger' ? {...btnPrimarySmall, background: '#dc2626'} : btnPrimarySmall} 
                onClick={() => { dialogue.action(); fermerDialogue(); }}
              >
                Confirmer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );

};
const layoutStyle = { display: 'flex', height: '100vh', background: '#1e293b' };
const mainStyle = { flex: 1, background: '#f8fafc', padding: '20px', display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const bannerStyle = { background: '#0d9488', color: 'white', padding: '12px 20px', borderRadius: '12px', display: 'flex', alignItems: 'center', gap: '10px', fontWeight: 'bold', marginBottom: '15px', fontSize: '13px' };
const contentLayout = { display: 'flex', gap: '20px', flex: 1, overflow: 'hidden' };
const leftZone = { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' };
const rightZone = { width: '280px', display: 'flex', flexDirection: 'column', gap: '12px' };
const searchContainer = { display: 'flex', gap: '10px', marginBottom: '15px' };
const searchBox = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '10px', display: 'flex', alignItems: 'center', padding: '0 12px', flex: 1 };
const searchInput = { border: 'none', padding: '10px 5px', width: '100%', outline: 'none', fontSize: '13px', fontWeight: '600' };
const tableWrapper = { flex: 1, background: 'white', borderRadius: '16px', border: '1px solid #e2e8f0', overflowY: 'auto' };
const tableStyle = { width: '100%', borderCollapse: 'collapse' };
const theadStyle = { background: '#f1f5f9', position: 'sticky', top: 0, zIndex: 10, color: '#475569', fontSize: '11px', fontWeight: '800' };
const trStyle = { borderBottom: '1px solid #f1f5f9', cursor: 'pointer' };
const tdStyle = { padding: '12px 15px', fontSize: '13px' };
const tdCenter = { padding: '12px', textAlign: 'center', fontSize: '13px', fontWeight: '700', color: '#334155' };
const footerSummary = { background: '#0f172a', padding: '15px 25px', borderRadius: '16px', marginTop: '15px', color: 'white' };
const summaryBox = { display: 'flex', flexDirection: 'column', fontSize: '10px', color: '#94a3b8', alignItems: 'center' };

const tCenter = { padding: '12px', textAlign: 'center' };
const valBold = { fontSize: '14px', fontWeight: '900', color: 'white', marginTop: '4px' };
const voletTitre = { background: '#0d9488', color: 'white', padding: '8px', fontSize: '11px', fontWeight: '900', textAlign: 'center', borderRadius: '10px 10px 0 0', margin: '-10px -10px 10px -10px' };
const aideBox = { flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', border: '2px dashed #e2e8f0', borderRadius: '16px', padding: '20px', background: 'white' };

const btnSuccess = { background: '#0d9488', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnWarn = { background: '#475569', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const btnDanger = { background: '#ef4444', color: 'white', border: 'none', padding: '14px', borderRadius: '12px', fontWeight: '900', fontSize: '12px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' };
const voletSaisie = { background: 'white', border: '1px solid #e2e8f0', borderRadius: '16px', padding: '10px' };
const inputStyle = { width: '100%', padding: '10px', border: '2px solid #0d9488', borderRadius: '10px', fontSize: '18px', textAlign: 'center', marginBottom: '10px', outline: 'none', fontWeight: '900' };
const btnPrimarySmall = { flex: 1, background: '#0d9488', color: 'white', border: 'none', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900' };
const btnOutlineSmall = { flex: 1, background: 'white', color: '#64748b', border: '1px solid #e2e8f0', padding: '10px', borderRadius: '8px', cursor: 'pointer', fontWeight: '900' };
const overlayStyle = { position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(15,23,42,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 };
const modalStyle = { background: 'white', borderRadius: '16px', width: '350px', overflow: 'hidden' };
const modalHeader = { background: '#f8fafc', padding: '15px', borderBottom: '1px solid #e2e8f0', display: 'flex', alignItems: 'center' };
const modalFooter = { padding: '15px', background: '#f8fafc', borderTop: '1px solid #e2e8f0', display: 'flex', gap: '10px' };

export default InventaireEmballage;