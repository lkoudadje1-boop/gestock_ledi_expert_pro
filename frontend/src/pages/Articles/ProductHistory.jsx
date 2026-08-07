import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Search, Loader2, Package, Hash, ChevronDown, ChevronUp, 
  FileText, Percent, Database, BookOpen
} from 'lucide-react';
import API from '../../services/api';
import Sidebar from '../../components/Sidebar';

const LEDI_BLUE = '#2563eb';

const ProductHistory = () => {
  const { id: initialId } = useParams();
  const navigate = useNavigate();
  
  // --- ÉTATS ---
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState([]);
  const [article, setArticle] = useState(null);
  const [currentId, setCurrentId] = useState(initialId || '');
  const [isGlobalView, setIsGlobalView] = useState(false); 
  
  // États pour l'autocomplétion
  const [articlesList, setArticlesList] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const suggestionRef = useRef(null);

  const [typeFilter, setTypeFilter] = useState('TOUS');
  const [expandedRow, setExpandedRow] = useState(null);
  const [filters, setFilters] = useState({
    dateDebut: `${new Date().getFullYear()}-01-01`,
    dateFin: `${new Date().getFullYear()}-12-31`
  });

  // =========================================================================
  // 🚀 INTEGRATION DU VERROU LOGISTIQUE DYNAMIQUE POUR LE GRAND LIVRE EXPERT
  // =========================================================================
  const formaterStockPOS = useCallback((valeurPieces, artContexte) => {
    if (valeurPieces === undefined || valeurPieces === null || valeurPieces === '') return "—";
    
    // 1. 🛡️ VERROU CRITIQUE DE LECTURE BRUTE : Si le backend nous donne déjà du texte formaté, 
    // on le retourne directement pour éviter tout recalcul erroné au frontend.
    if (typeof valeurPieces === 'string' && isNaN(Number(valeurPieces.trim()))) {
        return valeurPieces.trim();
    }

    // 2. Traitement classique de secours via les méta-données logistiques
    const qtePieces = Number(valeurPieces) || 0;
    
    // Extraction sécurisée des coefficients
    const coeff = Number(artContexte?.coefficient || artContexte?.unit_coefficient || artContexte?.coeff || 1);
    const codeGros = String(artContexte?.unit_code_gros || artContexte?.unite_code || artContexte?.code || 'CS').toUpperCase().trim();
    const refDetail = String(artContexte?.unit_ref_detail || artContexte?.unite_reference || 'UNITÉ').replace(/\(s\)/g, '').toUpperCase().trim();

    if (qtePieces === 0) return `0 ${refDetail}`;
    
    const estNegatif = qtePieces < 0;
    const qteTotaleAbs = Math.round(Math.abs(qtePieces));

    let resultatTextuel = "";

    if (coeff > 1) {
        const grosEntiers = Math.floor(qteTotaleAbs / coeff);
        const restesDetail = qteTotaleAbs % coeff;

        if (grosEntiers > 0 && restesDetail > 0) {
            resultatTextuel = `${grosEntiers} ${codeGros} + ${restesDetail} ${refDetail}`;
        } else if (grosEntiers > 0) {
            resultatTextuel = `${grosEntiers} ${codeGros}`;
        } else {
            resultatTextuel = `${restesDetail} ${refDetail}`;
        }
    } else {
        resultatTextuel = `${qteTotaleAbs} ${refDetail}`;
    }

    return estNegatif ? `-${resultatTextuel}` : resultatTextuel;
  }, []);

  // --- CHARGEMENT INITIAL SECURISÉ ---
  useEffect(() => {
    const fetchAllArticles = async () => {
      try {
        const res = await API.get('/products');
        const data = res.data?.data || res.data;
        setArticlesList(Array.isArray(data) ? data : []);
      } catch (err) {
        console.error("Erreur chargement liste articles:", err);
      }
    };
    fetchAllArticles();

    if (initialId) {
      generateGrandLivre(null, initialId);
    }

    const handleClickOutside = (event) => {
      if (suggestionRef.current && !suggestionRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [initialId]);

  // --- FONCTION RÉINITIALISER ---
  const handleReset = () => {
    const defaultFilters = {
      dateDebut: `${new Date().getFullYear()}-01-01`,
      dateFin: `${new Date().getFullYear()}-12-31`
    };
    setFilters(defaultFilters);
    setTypeFilter('TOUS');
    setSearchTerm('');
    setCurrentId('');
    setHistory([]);
    setArticle(null);
    setIsGlobalView(false);
  };

  // --- LOGIQUE AUTOCOMPLÉTION ---
  const suggestions = useMemo(() => {
    if (!searchTerm || searchTerm.length < 1) return [];
    return articlesList.filter(art => {
      const nomArt = (art.nom || '').toLowerCase();
      const idArt = (art.id || '').toString().toLowerCase();
      return nomArt.includes(searchTerm.toLowerCase()) || idArt.includes(searchTerm.toLowerCase());
    }).slice(0, 10);
  }, [searchTerm, articlesList]);

  const handleSelectArticle = (art) => {
    setCurrentId(art.id);
    setSearchTerm(art.nom);
    setShowSuggestions(false);
    setIsGlobalView(false);
    generateGrandLivre(null, art.id);
  };

  // --- ACTIONS ---
  const generateGrandLivre = async (e, idToUse = currentId) => {
    if (e) e.preventDefault();
    if (!idToUse) return;
    
    setLoading(true);
    setExpandedRow(null); 
    setIsGlobalView(false);
    try {
      const params = {
        dateDebut: filters.dateDebut,
        dateFin: `${filters.dateFin} 23:59:59`,
        type: typeFilter
      };

      const [resHist, resArt] = await Promise.all([
        API.get(`/products/${idToUse}/history`, { params }),
        API.get(`/products/${idToUse}`)
      ]);
      
      setHistory(resHist.data || []);
      setArticle(resArt.data || null);
      if(resArt.data) setSearchTerm(resArt.data.nom);
    } catch (err) { 
      console.error("Erreur Grand Livre:", err); 
    } finally { 
      setLoading(false); 
    }
  };

    // =========================================================================
  // 🚀 ACTION : CORRECTION CHIRURGICALE DU REQUÊTAGE GLOBAL PAR PLAGE DE DATES
  // =========================================================================
  const generateFullGrandLivre = async () => {
    setLoading(true);
    setExpandedRow(null);
    setArticle(null);
    setIsGlobalView(true); // Bascule l'interface en affichage consolidé
    
    try {
      // 🛡️ RECONSTITUTION DES PARAMÈTRES RÉSEAU POUR SQLITE
      const paramsPayload = {
        dateDebut: filters.dateDebut,
        // Sécurise la borne pour intercepter les flux jusqu'au soir du dernier jour
        dateFin: filters.dateFin.includes('23:59:59') ? filters.dateFin : `${filters.dateFin} 23:59:59`,
        type: typeFilter // 🎯 INJECTION DU TYPE DE SÉLECTION (ACHAT, VENTE, TOUS, etc.)
      };

      const res = await API.get('/products/history/all', { params: paramsPayload });
      setHistory(Array.isArray(res.data) ? res.data : []);
    } catch (err) {
      console.error("❌ Erreur Grand Livre Global par Date:", err);
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  // --- CALCULS ET TRI SYNCHRONE ---
  const filteredHistory = useMemo(() => {
    if (!history || !Array.isArray(history)) return [];
    
    // Si nous sommes en vue globale complète, le filtrage est déjà exécuté par l'API SQLite.
    if (isGlobalView || typeFilter === 'TOUS') return history;
    
    return history.filter(h => String(h.type).toUpperCase().trim() === String(typeFilter).toUpperCase().trim());
  }, [history, typeFilter, isGlobalView]);

  // Grouper par produit si vue globale (pour l'affichage hiérarchique)
  const groupedHistory = useMemo(() => {
    if (!isGlobalView) return { 'unique': filteredHistory };
    
    return filteredHistory.reduce((acc, curr) => {
      const key = curr.product_id || curr.id_article || 'Autre'; 
      if (!acc[key]) acc[key] = [];
      acc[key].push(curr);
      return acc;
    }, {});
  }, [filteredHistory, isGlobalView]);

  // =========================================================================
  // 🧮 TOTALISATION FINANCIÈRE SÉCURISÉE DU GRAND LIVRE (SIMPLE LECTURE BRUTE)
  // =========================================================================
  const totals = useMemo(() => {
    if (!filteredHistory || filteredHistory.length === 0) {
      return { qteEntree: 0, qteSortie: 0, montantEntree: 0, montantSortie: 0 };
    }

    return filteredHistory.reduce((acc, curr) => {
      const typeMvt = String(curr.type).toUpperCase().trim();
      
      // Lecture de la colonne financière brute gravée en BDD
      const mt = Math.abs(Number(curr.montant || 0));

      const qe = Number(curr.qte_entree || 0) || 0;
      const qs = Number(curr.qte_sortie || 0) || 0;

      acc.qteEntree += qe;
      acc.qteSortie += qs;

      // Ventilation basée exclusivement sur le sens des quantités de la ligne SQL
      if (qe > 0) {
        acc.montantEntree += mt;
      }
      if (qs > 0) {
        acc.montantSortie += mt;
      }

      return acc;
    }, { qteEntree: 0, qteSortie: 0, montantEntree: 0, montantSortie: 0 });
  }, [filteredHistory]);


  // --- HELPERS RENDU ---
  const formatCur = (val) => new Intl.NumberFormat('fr-FR').format(Math.round(val || 0));
  const formatDateTime = (dateStr) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString('fr-FR') + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  };
  const dash = (val) => (val === null || val === undefined || val === '' ? "—" : val);

  const renderStatusBadge = (row) => {
    let label = "VALIDÉE";
    let color = "#059669"; 
    let bg = "#dcfce7";

    if (row.is_active === 0 || row.type === 'ANNULEE' || row.type === 'ANNULATION') {
      label = "ANNULÉE";
      color = "#475569"; 
      bg = "#f1f5f9";
    } else if (row.type === 'RETOUR' || row.type === 'RETOUR_CLIENT' || row.type === 'RETOUR_FOURNISSEUR') {
      label = "RETOURNÉE";
      color = "#d97706"; 
      bg = "#fef3c7";
    }

    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '5px' }}>
        <div style={{
          padding: '4px 12px',
          borderRadius: '20px',
          fontSize: '10px',
          fontWeight: '900',
          background: bg,
          color: color,
          border: `1px solid ${color}44`,
          textTransform: 'uppercase'
        }}>
          ● {label}
        </div>
        <div style={{ display: 'flex', gap: '5px' }}>
          {row.is_comptabilise === 1 && (
            <span title="Comptabilisé" style={s.miniBadgeAudit}>
              <Database size={10} /> COMPTA
            </span>
          )}
          {row.is_cloture === 1 && (
            <span title="Période Clôturée" style={{...s.miniBadgeAudit, background: '#1e293b'}}>
              <Hash size={10} /> CLÔTURÉ
            </span>
          )}
        </div>
      </div>
    );
  };

return (
    <div style={s.layout}>
      <Sidebar />
      <main style={s.main}>
        <header style={s.header}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button onClick={() => navigate('/admin/articles')} style={s.btnBack}><ArrowLeft size={20} /></button>
            <div>
              <h1 style={s.title}>GRAND LIVRE EXPERT</h1>
              <div style={s.subtitle}>TRAÇABILITÉ TOTALE DES FLUX & AUDIT TECHNIQUE</div>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
            {/* BOUTON GRAND LIVRE COMPLET */}
            <button onClick={generateFullGrandLivre} style={s.btnFull} disabled={loading}>
              <BookOpen size={16} /> GRAND LIVRE COMPLET
            </button>

            <div style={s.filterGroup}>
              <label style={s.labelMini}>MOUVEMENT</label>
              <select style={s.inputSmall} value={typeFilter} onChange={(e) => setTypeFilter(e.target.value)}>
                <option value="TOUS">TOUS</option>
                <option value="ACHAT">ACHATS</option>
                <option value="VENTE">VENTES</option>
                <option value="RETOUR">RETOURS</option>
                <option value="ANNULEE">ANNULATIONS</option>
                <option value="INVENTAIRE">INVENTAIRE</option>
              </select>
            </div>

            <div style={{ ...s.filterGroup, position: 'relative' }} ref={suggestionRef}>
                <label style={s.labelMini}>RECHERCHE ARTICLE</label>
                <input 
                  style={s.inputSmall} 
                  value={searchTerm} 
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setShowSuggestions(true);
                  }}
                  onFocus={() => setShowSuggestions(true)}
                  placeholder="Nom ou ID..." 
                />

                {showSuggestions && searchTerm && (
                  <div style={s.suggestionBox}>
                    {suggestions.length > 0 ? (
                      suggestions.map(art => (
                        <div 
                          key={art.id} 
                          style={s.suggestionItem}
                          onClick={() => handleSelectArticle(art)}
                        >
                          <span style={{ fontWeight: 'bold', color: LEDI_BLUE }}>{art.id}</span> - {art.nom}
                        </div>
                      ))
                    ) : (
                      <div style={s.noSuggestion}>Aucun résultat</div>
                    )}
                  </div>
                )}
            </div>

            <div style={s.filterGroup}><label style={s.labelMini}>DU</label>
              <input type="date" style={s.inputDate} value={filters.dateDebut} onChange={(e) => setFilters({...filters, dateDebut: e.target.value})} />
            </div>
            <div style={s.filterGroup}><label style={s.labelMini}>AU</label>
              <input type="date" style={s.inputDate} value={filters.dateFin} onChange={(e) => setFilters({...filters, dateFin: e.target.value})} />
            </div>
            <button onClick={generateGrandLivre} style={s.btnGenerate} disabled={loading}>
              {loading ? <Loader2 className="animate-spin" size={18} /> : <Search size={18} />}
            </button>
          </div>
        </header>

        <div style={s.content}>
          {article && !isGlobalView && (
            <div style={s.infoBar}>
              <div style={s.infoItem}><Package size={18} color={LEDI_BLUE}/> <b>{article.nom}</b></div>
              <div style={s.infoItem}><Hash size={18} color={LEDI_BLUE}/> REF: <b>{article.id}</b></div>
              {/* 🎯 LECTURE ET FORMATAGE BRUT : Respect de l'unité théorique sans calcul */}
              <div style={{...s.infoItem, marginLeft: 'auto'}}>STOCK ACTUEL: <b style={{color: LEDI_BLUE, fontSize: '18px'}}>{formaterStockPOS(article.stock_actuel, article)}</b></div>
            </div>
          )}


   <div style={s.tableCard}>
        <table style={{ ...s.table, tableLayout: 'fixed', width: '100%' }}>
              <thead style={s.stickyHeader}>
                <tr style={s.theadTr}>
                  <th style={{width: '40px'}}></th>
                  <th style={{ ...s.th, width: '140px' }}>DATE & HEURE</th>
                  <th style={{ ...s.th, width: '110px' }}>TYPE</th>
                  <th style={{ ...s.th, width: '130px' }}>RÉFÉRENCE</th>
                  <th style={s.th}>TIERS / LIBELLÉ</th>
                  
                  <th style={{ ...s.thCenter, width: '180px', textAlign: 'center' }}>ENTRÉE</th>
                  <th style={{ ...s.thCenter, width: '180px', textAlign: 'center' }}>SORTIE</th>
                  
                  <th style={{ ...s.thRight, width: '120px' }}>VALEUR TTC</th>
                </tr>
              </thead>

 <tbody>
  {loading ? (
    <tr>
      <td colSpan="8" style={s.loadingTd}>
        <Loader2 className="animate-spin" size={40} />
      </td>
    </tr>
  ) : Object.keys(groupedHistory).length > 0 ? (
    Object.keys(groupedHistory).map((productKey) => {
      
      // 🧮 CALCUL DES SOUS-TOTAUX ALIGNÉ EN SIMPLE LECTURE DE LA VALEUR BRUTE COMPTABLE (ZÉRO CALCUL)
      const subTotal = groupedHistory[productKey].reduce((acc, curr) => {
        // Lecture directe de la colonne monétaire issue du SQL
        const mt = Math.abs(Number(curr.montant || 0));
        
        const qe = Number(curr.qte_entree || 0) || 0;
        const qs = Number(curr.qte_sortie || 0) || 0;
        
        acc.qteE += qe;
        acc.qteS += qs;

        // On somme la valeur brute dans sa colonne respective selon le sens de la quantité stockée
        if (qe > 0) {
          acc.mtE += mt;
        } 
        if (qs > 0) {
          acc.mtS += mt;
        }
        
        return acc;
      }, { qteE: 0, qteS: 0, mtE: 0, mtS: 0 });

      return (
        <React.Fragment key={productKey}>
          {/* 1. EN-TÊTE DE PRODUIT */}
          {isGlobalView && (
            <tr style={s.productHeaderRow}>
              <td colSpan="8" style={s.productHeaderTd}>
                <div style={s.productHeaderFlex}>
                  <Package size={14} /> 
                  <span>
                    ARTICLE : <b style={{ color: '#2563eb' }}>{productKey}</b> 
                    <span style={{ marginLeft: '10px', textTransform: 'uppercase', color: '#64748b' }}>
                      - {groupedHistory[productKey][0]?.article_nom || "Désignation inconnue"}
                    </span>
                  </span>
                </div>
              </td>
            </tr>
          )}

                   {groupedHistory[productKey].map((row, i) => (
            <React.Fragment key={`${productKey}-${i}`}>
              <tr 
                onClick={() => setExpandedRow(expandedRow === `${productKey}-${i}` ? null : `${productKey}-${i}`)} 
                style={{...(i % 2 === 0 ? s.trEven : s.trNormal), cursor: 'pointer'}}
              >
                <td style={{textAlign: 'center', color: '#2563eb'}}>
                  {expandedRow === `${productKey}-${i}` ? <ChevronUp size={16}/> : <ChevronDown size={16}/>}
                </td>
                <td style={s.td}>{formatDateTime(row.date)}</td>
                <td style={s.td}><span style={typeBadge(row.type)}>{row.type}</span></td>
                <td style={{...s.td, fontWeight: 'bold'}}>{row.reference}</td>
                
                {/* 🎯 CORRECTIONS CHIRURGICALE APPLIQUÉE : Affiche le nom de l'article pour l'inventaire et le tiers pour les autres flux */}
                <td style={s.td}>
                  {row.type === 'INVENTAIRE' 
                    ? dash(row.article_nom || row.nom_article_snap) 
                    : dash(row.tiers)
                  }
                </td>
                
                {/* 🎯 LECTURE COMPTABLE BRUTE : Affichage direct de l'expression fournie par l'API */}
                <td style={{ ...s.tdIn, width: '180px', textAlign: 'center' }}>
                  {row.qte_entree_formatee ? `+${row.qte_entree_formatee}` : "—"}
                </td>
                
                {/* 🎯 LECTURE COMPTABLE BRUTE : Affichage direct de l'expression fournie par l'API */}
                <td style={{ ...s.tdOut, width: '180px', textAlign: 'center' }}>
                  {row.qte_sortie_formatee ? `-${row.qte_sortie_formatee}` : "—"}
                </td>
                
                {/* 🎯 LOGIQUE ÉTANCHÉE : Lecture simple de la valeur monétaire brute figée */}
                <td style={s.tdTotal}>{formatCur(row.montant)} F</td>
              </tr>

              {expandedRow === `${productKey}-${i}` && (
                <tr>
                  <td colSpan="8" style={{ padding: '0', backgroundColor: '#f8fafc' }}>
                    <div style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      padding: '20px 40px',
                      borderBottom: '1px solid #e2e8f0',
                      animation: 'fadeIn 0.2s ease-out'
                    }}>
                      <div style={{ flex: 1, minWidth: '200px' }}>
                        <h4 style={s.detailTitle}><FileText size={14} style={{ marginRight: 8 }}/> IDENTIFICATION</h4>
                        <div style={{ marginTop: 12 }}>
                          <p style={s.detailP}>N° Lot: <b style={{ color: '#2563eb', fontFamily: 'monospace' }}>{dash(row.lot_id)}</b></p>
                          <p style={s.detailP}>Opérateur: <b>{dash(row.operateur_nom)}</b></p>
                          <p style={s.detailP}>Type précis: <span style={{ fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase' }}>{row.type}</span></p>
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: '200px', borderLeft: '1px solid #e2e8f0', paddingLeft: '25px' }}>
                        <h4 style={s.detailTitle}><Percent size={14} style={{ marginRight: 8 }}/> FINANCES DÉTAILLÉES</h4>
                        <div style={{ marginTop: 12 }}>
                          <p style={s.detailP}>Montant HT: <b>{row.mt_ht ? `${formatCur(row.mt_ht)} F` : "—"}</b></p>
                          {row.remise > 0 && <p style={{ ...s.detailP, color: '#e11d48' }}>Remise: <b>-{formatCur(row.remise)} F</b></p>}
                          <p style={s.detailP}>TVA: <b>{row.mt_tva ? `${formatCur(row.mt_tva)} F` : "—"}</b></p>
                          <p style={{ ...s.detailP, marginTop: '8px', paddingTop: '8px', borderTop: '1px dashed #eee' }}>
                            PU: <b style={{ fontSize: '1.1em' }}>{formatCur(row.PU)} F</b>
                          </p>
                        </div>
                      </div>

                     <div style={{ flex: 1, minWidth: '200px', borderLeft: '1px solid #e2e8f0', paddingLeft: '25px' }}>
                        <h4 style={s.detailTitle}><Database size={14} style={{ marginRight: 8 }}/> ÉTAT DES STOCKS</h4>
                        <div style={{ marginTop: 12 }}>
                          {/* 🎯 LECTURE FLUIDE ET BRUTE DES VARIATIONS SANS FORMULE COMPLEXE AU RENDU */}
                          {(() => {
                            const typeMvt = String(row.type).toUpperCase().trim();
                            const estRetour = typeMvt === 'RETOUR' || typeMvt === 'RETOUR_CLIENT' || typeMvt === 'RETOUR_FOURNISSEUR';
                            const estEntreePositive = Number(row.qte_entree || 0) > Number(row.qte_sortie || 0);

                            return (
                              <>
                                <p style={s.detailP}>Avant: <span style={{ color: '#64748b' }}>{row.stock_av_formate || "—"}</span></p>
                                <p style={s.detailP}>Après: <b style={{ color: '#1e293b' }}>{row.stock_ap_formate || "—"}</b></p>
                                <p style={s.detailP}>
                                  Impact: 
                                  <b style={{ 
                                    marginLeft: '5px',
                                    color: estRetour || estEntreePositive ? '#059669' : '#e11d48',
                                    backgroundColor: estRetour || estEntreePositive ? '#ecfdf5' : '#fff1f2',
                                    padding: '2px 6px',
                                    borderRadius: '4px'
                                  }}>
                                    {row.qte_entree_formatee ? `+${row.qte_entree_formatee}` : `-${row.qte_sortie_formatee || "0 UNITÉ"}`}
                                  </b>
                                </p>
                              </>
                            );
                          })()}
                        </div>
                      </div>

                      <div style={{ flex: 1, minWidth: '220px', borderLeft: '1px solid #e2e8f0', paddingLeft: '25px', textAlign: 'right' }}>
                        <div style={s.detailLabel}>STATUT OPÉRATIONNEL</div>
                        <div style={{ margin: '8px 0 15px 0' }}>{renderStatusBadge(row)}</div>
                        <div style={s.detailLabel}>OBSERVATION</div>
                        <div style={{ ...s.noteText, fontStyle: row.note ? 'normal' : 'italic', color: row.note ? '#475569' : '#cbd5e1', fontSize: '12px', marginTop: '5px' }}>
                          {row.note || "Aucune observation enregistrée"}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              )}
            </React.Fragment>
          ))}


          {/* 🚀 LIGNE DE SOUS-TOTAL DU PRODUIT AVEC CONVERSION GROS + DETAIL DES CUMULS DE MANIERE NETTE */}
          {(() => {
            const firstRow = groupedHistory[productKey]?.[0] || {};
            const ctxSub = {
              coefficient: Number(firstRow.coefficient || firstRow.coeff || article?.coefficient || 1),
              unit_code_gros: String(firstRow.unit_code_gros || firstRow.unite_code || firstRow.code || article?.unit_code_gros || 'CS').toUpperCase().trim(),
              unit_ref_detail: String(firstRow.unit_ref_detail || firstRow.unite_reference || firstRow.ref_detail || article?.unit_ref_detail || 'UNITÉ').toUpperCase().trim()
            };
            
            return (
              <tr style={{ background: '#f1f5f9', borderTop: '1px solid #cbd5e1', borderBottom: '2px solid #94a3b8' }}>
                <td colSpan="5" style={{ padding: '6px 12px', textAlign: 'right', fontSize: '10px', fontWeight: '900', color: '#475569' }}>
                  SOUS-TOTAL {productKey} :
                </td>
                <td style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #e2e8f0', width: '180px' }}>
                   <div style={{color: '#059669', fontWeight: '900', fontSize: '11px'}}>
                     {formaterStockPOS(subTotal.qteE, ctxSub)}
                   </div>
                   <div style={{fontSize: '9px', color: '#64748b'}}>{formatCur(subTotal.mtE)} F</div>
                </td>
                <td style={{ padding: '4px', textAlign: 'center', borderLeft: '1px solid #e2e8f0', width: '180px' }}>
                   <div style={{color: '#e11d48', fontWeight: '900', fontSize: '11px'}}>
                     {formaterStockPOS(-subTotal.qteS, ctxSub)}
                   </div>
                   <div style={{fontSize: '9px', color: '#64748b'}}>{formatCur(subTotal.mtS)} F</div>
                </td>
                <td style={{ padding: '4px 12px', textAlign: 'right', borderLeft: '1px solid #e2e8f0', width: '120px' }}>
                  <div style={{fontSize: '9px', color: '#64748b', fontWeight: 'bold'}}>DISPONIBLE:</div>
                  <div style={{ fontWeight: '900', color: '#2563eb', fontSize: '12px' }}>
                    {formaterStockPOS(subTotal.qteE - subTotal.qteS, ctxSub)}
                  </div>
                </td>
              </tr>
            );
          })()}
        </React.Fragment>
      );
    })
  ) : (
    <tr>
      <td colSpan="8" style={s.loadingTd}>Aucun mouvement trouvé.</td>
    </tr>
  )}
</tbody>
<tfoot style={s.tfoot}>
  {/* 🚀 LIGNE DES ENTRÉES FINANCIÈREMENT ET LOGISTIQUEMENT SÉCURISÉE */}
  <tr style={{ borderBottom: '1px solid #e2e8f0', height: '40px' }}>
    <td colSpan="5" style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#0f172a', paddingRight: '15px' }}>
      TOTAL ENTRÉES PÉRIODE :
    </td>
    <td 
      style={{ ...s.td, color: '#64748b', fontSize: '13px', textAlign: 'center', fontWeight: '700', width: '180px' }} 
      title={`Volume global entrées (pièces) : ${totals.qteEntree.toLocaleString()} Pcs`}
    >
      -
    </td>
    <td style={{ ...s.td, textAlign: 'center', color: '#cbd5e1', width: '180px' }}>—</td>
    <td style={{ ...s.td, color: '#059669', fontWeight: '900', textAlign: 'right', fontSize: '13px', paddingRight: '10px', width: '120px' }}>
      {formatCur(totals.montantEntree)} F
    </td>
  </tr>

  {/* 🚀 LIGNE DES SORTIES FINANCIÈREMENT ET LOGISTIQUEMENT SÉCURISÉE */}
  <tr style={{ height: '40px' }}>
    <td colSpan="5" style={{ ...s.td, textAlign: 'right', fontWeight: 'bold', fontSize: '13px', color: '#0f172a', paddingRight: '15px' }}>
      TOTAL SORTIES PÉRIODE :
    </td>
    <td style={{ ...s.td, textAlign: 'center', color: '#cbd5e1', width: '180px' }}>—</td>
    <td 
      style={{ ...s.td, color: '#64748b', fontSize: '13px', textAlign: 'center', fontWeight: '700', width: '180px' }} 
      title={`Volume global sorties (pièces) : ${totals.qteSortie.toLocaleString()} Pcs`}
    >
      -
    </td>
    <td style={{ ...s.td, color: '#e11d48', fontWeight: '900', textAlign: 'right', fontSize: '13px', paddingRight: '10px', width: '120px' }}>
      {formatCur(totals.montantSortie)} F
    </td>
  </tr>
</tfoot>

            </table>
          </div>
        </div>
      </main>
    </div>
  );
};


const s = {
  // Styles originaux préservés
  layout: { display: 'flex', height: '100vh', background: '#f8fafc', overflow: 'hidden' },
  main: { flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  header: { background: LEDI_BLUE, padding: '12px 30px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0, position: 'relative', zIndex: 100 },
  btnBack: { background: 'rgba(255,255,255,0.2)', border: 'none', color: 'white', padding: '8px', borderRadius: '50%', cursor: 'pointer', display: 'flex' },
  title: { margin: 0, fontSize: '16px', fontWeight: '900', color: 'white' },
  subtitle: { fontSize: '9px', color: 'rgba(255,255,255,0.7)', fontWeight: '700' },
  filterGroup: { display: 'flex', flexDirection: 'column' },
  labelMini: { fontSize: '8px', fontWeight: '800', color: 'rgba(255,255,255,0.8)', marginBottom: '2px', textTransform: 'uppercase' },
  inputSmall: { padding: '6px 10px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 'bold', width: '160px', outline: 'none' },
  inputDate: { padding: '5px 8px', borderRadius: '6px', border: 'none', fontSize: '11px', fontWeight: 'bold' },
  btnGenerate: { background: 'white', color: LEDI_BLUE, border: 'none', padding: '8px 15px', borderRadius: '8px', fontWeight: '900', cursor: 'pointer' },
  
  // Nouveau style pour le bouton Grand Livre Complet
  btnFull: { 
    background: '#1e293b', 
    color: 'white', 
    border: 'none', 
    padding: '8px 15px', 
    borderRadius: '8px', 
    fontWeight: '800', 
    fontSize: '10px',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginRight: '10px',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)'
  },

  // Styles pour les lignes de séparation par produit
 // Remplace ces deux styles dans ton objet 's'
productHeaderRow: { 
  background: '#f1f5f9' 
},
productHeaderTd: { 
  padding: '8px 15px', 
  fontWeight: '900', 
  color: LEDI_BLUE, 
  fontSize: '11px', 
  borderBottom: '1px solid #cbd5e1',
  // display: 'flex' supprimé d'ici !
},
// Ajoute ce nouveau style pour l'intérieur de la cellule
productHeaderFlex: {
  display: 'flex',
  alignItems: 'center',
  gap: '10px'
},
subTotalRow: { 
  background: '#f8fafc', 
  borderBottom: '2px solid #e2e8f0',
  borderTop: '1px dashed #cbd5e1'
},
subTotalLabel: { 
  padding: '8px 12px', 
  textAlign: 'right', 
  fontSize: '10px', 
  fontWeight: '900', 
  color: '#475569' 
},
subTotalVal: { 
  padding: '8px 5px', 
  textAlign: 'center', 
  fontSize: '11px', 
  fontWeight: '800',
  verticalAlign: 'top'
},
subTotalAmt: { 
  fontSize: '9px', 
  opacity: 0.8, 
  marginTop: '2px' 
},
subTotalFinal: { 
  padding: '8px 12px', 
  textAlign: 'right', 
  fontWeight: '900', 
  color: LEDI_BLUE,
  fontSize: '11px'
},

  suggestionBox: { position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: '8px', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.2)', marginTop: '5px', maxHeight: '250px', overflowY: 'auto', border: '1px solid #e2e8f0', zIndex: 999 },
  suggestionItem: { padding: '10px 12px', fontSize: '11px', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', color: '#334155', '&:hover': { background: '#f8fafc' } },
  noSuggestion: { padding: '10px', fontSize: '11px', color: '#94a3b8', textAlign: 'center' },
  content: { padding: '20px', flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' },
  infoBar: { display: 'flex', gap: '30px', background: 'white', padding: '12px 25px', borderRadius: '10px', marginBottom: '15px', borderLeft: `5px solid ${LEDI_BLUE}`, boxShadow: '0 1px 3px rgba(0,0,0,0.1)' },
  infoItem: { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#334155' },
  tableCard: { background: 'white', borderRadius: '10px', border: '1px solid #e2e8f0', overflowY: 'auto', flex: 1 },
  table: { width: '100%', borderCollapse: 'collapse', fontSize: '12px' },
  stickyHeader: { position: 'sticky', top: 0, zIndex: 10, background: '#f8fafc' },
  theadTr: { borderBottom: '2px solid #e2e8f0' },
  th: { padding: '12px', textAlign: 'left', fontWeight: '800', color: '#64748b', fontSize: '10px', textTransform: 'uppercase' },
  thCenter: { padding: '12px', textAlign: 'center', fontWeight: '800', color: '#64748b', fontSize: '10px' },
  thRight: { padding: '12px', textAlign: 'right', fontWeight: '800', color: '#64748b', fontSize: '10px' },
  td: { padding: '10px 12px', borderBottom: '1px solid #f1f5f9' },
  tdIn: { padding: '10px 12px', textAlign: 'center', color: '#059669', fontWeight: '900' },
  tdOut: { padding: '10px 12px', textAlign: 'center', color: '#e11d48', fontWeight: '900' },
  tdTotal: { padding: '10px 12px', textAlign: 'right', fontWeight: '900', color: LEDI_BLUE },
  trNormal: { background: 'white' },
  trEven: { background: '#fcfdfe' },
  detailWrapper: { background: '#f1f5f9', borderBottom: '2px solid #cbd5e1' },
  detailContent: { padding: '20px 40px', display: 'flex', justifyContent: 'space-between', gap: '30px' },
  detailSection: { flex: 1, borderLeft: '2px solid #cbd5e1', paddingLeft: '15px' },
  detailTitle: { fontSize: '9px', color: '#64748b', fontWeight: '900', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '5px' },
  detailP: { fontSize: '11px', margin: '4px 0', color: '#334155' },
  detailBadgeArea: { textAlign: 'right', minWidth: '220px' },
  detailLabel: { fontSize: '8px', fontWeight: '900', color: '#94a3b8', marginBottom: '5px', textTransform: 'uppercase' },
  noteText: { fontSize: '13px', fontWeight: '700', color: '#475569', fontStyle: 'italic' },
  tfoot: { position: 'sticky', bottom: 0, background: '#f8fafc', fontWeight: 'bold', borderTop: '2px solid #cbd5e1' },
  tdFootLabel: { padding: '12px', textAlign: 'right', color: '#64748b', fontSize: '10px' },
  tdFootVal: { padding: '12px', textAlign: 'center', color: '#1e293b', fontWeight: '900' },
  tdFootTotal: { padding: '12px', textAlign: 'right', color: LEDI_BLUE, fontSize: '14px', fontWeight: '900' },
  loadingTd: { padding: '100px', textAlign: 'center' },
  miniBadgeAudit: { display: 'flex', alignItems: 'center', gap: '4px', fontSize: '9px', fontWeight: '900', padding: '3px 6px', borderRadius: '5px', background: '#0f172a', color: 'white' },
};

const typeBadge = (t) => {
  const configs = {
    'ACHAT':     { bg: '#dcfce7', text: '#166534' },
    'VENTE':     { bg: '#fee2e2', text: '#991b1b' },
    'RETOUR':    { bg: '#e0f2fe', text: '#075985' },
    'ANNULEE':   { bg: '#f1f5f9', text: '#475569' },
    'ANNULATION':{ bg: '#f1f5f9', text: '#475569' },
    'INVENTAIRE':{ bg: '#fef3c7', text: '#92400e' }
  };
  const style = configs[t] || { bg: '#f1f5f9', text: '#475569' };
  return { padding: '3px 7px', borderRadius: '4px', fontSize: '9px', fontWeight: '900', background: style.bg, color: style.text, textTransform: 'uppercase' };
};

export default ProductHistory;