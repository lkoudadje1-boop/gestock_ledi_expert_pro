import React, { useState, useEffect, useMemo } from 'react';
import { 
    Save, Plus, Trash2, Layout, Database, RefreshCw, ListTree, ChevronRight, 
    Lock, FilePlus, List as ListIcon, X, AlertCircle, CheckCircle, HelpCircle 
} from 'lucide-react';
import Sidebar from '../../components/Sidebar';
import { getUserPermissions } from '../../utils/permissions_utils'; // 🔑 IMPORTATION DU SÉCURISEUR
import API from '../../services/api';

const ConfigEvenementDynamique = () => {
    // 🔑 EXTRACTION COMPTABLE ET SOUPLITUDE DES TYPES (true, 1, 'true', '1') POUR LES BOUTONS DES ECRITURES AUTOMATIQUES
    const userPerms = useMemo(() => getUserPermissions(), []);
    
    const canCreateSchema = userPerms['compta_auto_btn_create'] === true || userPerms['compta_auto_btn_create'] === 1 || userPerms['compta_auto_btn_create'] === 'true' || userPerms['compta_auto_btn_create'] === '1';
    const canSaveSchema = userPerms['compta_auto_btn_save'] === true || userPerms['compta_auto_btn_save'] === 1 || userPerms['compta_auto_btn_save'] === 'true' || userPerms['compta_auto_btn_save'] === '1';
    const canAddSchemaLine = userPerms['compta_auto_btn_add_line'] === true || userPerms['compta_auto_btn_add_line'] === 1 || userPerms['compta_auto_btn_add_line'] === 'true' || userPerms['compta_auto_btn_add_line'] === '1';
    // 🔑 AJOUT DE LA PERMISSION MANQUANTE POUR ÉVITER LE REFERENCEERROR
    const canModifySchema = userPerms['compta_auto_btn_modify'] === true || userPerms['compta_auto_btn_modify'] === 1 || userPerms['compta_auto_btn_modify'] === 'true' || userPerms['compta_auto_btn_modify'] === '1';

    // --- ÉTATS PRINCIPAUX ---
    const [activeTab, setActiveTab] = useState('config');
    const [existingConfigs, setExistingConfigs] = useState([]);
    const [loading, setLoading] = useState(false);
    const [comptes, setComptes] = useState([]);
    const [journaux, setJournals] = useState([]);
    const [selectedTable, setSelectedTable] = useState('sale_items');
    const [tableColumns, setTableColumns] = useState([]); 

    const [paymentMethods, setPaymentMethods] = useState([]); 
    // --- ÉTATS UI (TOAST & SUGGESTIONS) ---
    const [activeSuggestion, setActiveSuggestion] = useState({ lineId: null, search: '', results: [] });
    const [toast, setToast] = useState({ 
        show: false, 
        msg: '', 
        type: 'success', 
        onConfirm: null 
    });

    const initialEvenement = {
        code_evenement: '',
        libelles: '',
        type_operation: 'CREDIT',
        mode_ecriture: 'DIRECT',
        condition_reglement: '', 
        type_vente: '', 
        lignes: []
    };
    const [evenement, setEvenement] = useState(initialEvenement);

    const tablesERP = [
        { id: 'sale_items', label: 'VENTES ARTICLES (PF)', icon: <Layout size={18}/> },
        { id: 'purchase_items', label: 'ACHATS ARTICLES (PF)', icon: <Database size={18}/> },
        { id: 'purchase_items_mp', label: 'ACHATS MATIÈRES P.', icon: <Database size={18} color="#eab308"/> },
        { id: 'inventory_items', label: 'INVENTAIRE ARTICLES (PF)', icon: <ListTree size={18}/> },
        { id: 'inventory_items_mp', label: 'INVENTAIRE MATIÈRES P.', icon: <ListTree size={18} color="#eab308"/> },
        { id: 'inventory_items_psf', label: 'INVENTAIRE SEMI-FINIS', icon: <ListTree size={18} color="#2563eb"/> },
        { id: 'stock_operation_items_pf', label: 'OP. STOCK PRODUITS F.', icon: <RefreshCw size={18}/> },
        { id: 'stock_operation_items_mp', label: 'OP. STOCK MATIÈRES P.', icon: <RefreshCw size={18} color="#eab308"/> },
        { id: 'stock_operation_items_psf', base_calcul: '', label: 'OP. STOCK SEMI-FINIS', icon: <RefreshCw size={18} color="#2563eb"/> },
        { id: 'besoins_production', label: 'PRODUCTION (BESOINS)', icon: <Database size={18} color="#059669"/> },
    ];

    // --- LOGIQUE DE NOTIFICATION ---
    const triggerToast = (msg, type = 'success', onConfirm = null) => {
        setToast({ show: true, msg, type, onConfirm });
        if (type !== 'confirm') {
            setTimeout(() => setToast({ show: false, msg: '', type: 'success', onConfirm: null }), 4000);
        }
    };

    const closeToast = () => setToast({ ...toast, show: false });

    // --- LOGIQUE MÉTIER ---
    const isFormInvalid = !evenement.code_evenement || 
                         !evenement.libelles || 
                         evenement.lignes.length === 0 || 
                         evenement.lignes.some(l => !l.journal_id || !l.base_calcul || !l.num_compte);

    const isTiersAccount = (num) => {
        if (!num) return false;
        const s = num.toString();

        return s.startsWith('40') || 
               s.startsWith('41') || 
               s.startsWith('422') || 
               s.startsWith('47');
    };

    const loadBaseData = async () => {
        try {
            const [resCpt, resJrn, resCols, resMethods] = await Promise.all([
                API.get('/plan-comptable/liste'),
                API.get('/plan-comptable/journaux/liste'),
                API.get(`/config-compta/columns/${selectedTable}`),
                API.get('/plan-comptable/paiements/methodes') 
            ]);
            setComptes(resCpt.data.data || []);
            setJournals(resJrn.data.data || []);
            setTableColumns(resCols.data.data || []); 
            setPaymentMethods(resMethods.data.data || []); 
        } catch (err) { 
            console.error("Erreur de chargement :", err); 
        }
    };

    const loadExistingConfigs = async () => {
        try {
            const res = await API.get(`/config-compta/list-by-table/${selectedTable}`);
            setExistingConfigs(res.data.data || []);
        } catch (err) { console.error(err); }
    };

    useEffect(() => { loadBaseData(); }, [selectedTable]);
    
    useEffect(() => { 
        if (activeTab === 'list') loadExistingConfigs(); 
    }, [selectedTable, activeTab]);

    const handleCompteChange = (id, val) => {
        const numericValue = val.replace(/\D/g, ''); 
        updateLine(id, 'num_compte', numericValue);
        
        if (numericValue.length >= 1) {
            const filtered = comptes.filter(c => c.numero_compte.toString().startsWith(numericValue)).slice(0, 15);
            setActiveSuggestion({ lineId: id, search: numericValue, results: filtered });
        } else {
            setActiveSuggestion({ lineId: null, search: '', results: [] });
        }
    };

    const selectCompte = (lineId, num) => {
        const newLignes = evenement.lignes.map(l => {
            if (l.id === lineId) {
                return { ...l, num_compte: num, is_tiers: isTiersAccount(num) ? 1 : 0 };
            }
            return l;
        });
        setEvenement(prev => ({ ...prev, lignes: newLignes }));
        setActiveSuggestion({ lineId: null, search: '', results: [] });
    };

    const addLine = () => {
        // 🔑 SÉCURITÉ DE GRAPHISME INTERNE : Bloquer l'ajout d'une ligne d'imputation si la permission est absente
        if (!canAddSchemaLine) {
            return triggerToast("🛑 ACCÈS REFUSÉ : Privilège d'ajout de ligne d'imputation manquant.", "error");
        }

        setEvenement({
            ...evenement,
            lignes: [...evenement.lignes, { 
                id: Date.now(), journal_id: '', num_compte: '', is_tiers: 0, sens: 'DEBIT', 
                base_calcul: ''
            }]
        });
    };

    const updateLine = (id, field, value) => {
        const newLignes = evenement.lignes.map(l => l.id === id ? { ...l, [field]: value } : l);
        setEvenement({ ...evenement, lignes: newLignes });
    };

         const handleNew = () => {
        setEvenement({ ...initialEvenement, code_evenement: `${selectedTable.toUpperCase()}_NEW` });
        setActiveTab('config');
    };

    const handleEdit = (config) => {
        // La variable canModifySchema déclarée au bloc 1 est maintenant parfaitement reconnue ici
        if (!canModifySchema) {
            return triggerToast("🛑 ACCÈS REFUSÉ : Privilège de modification de schéma manquant.", "error");
        }
        const conditionValue = config.condition_reglement || '';
        const typeOpValue = config.type_operation || config.type_vente || ''; 

        setEvenement({
            code_evenement: config.code_evenement,
            libelles: config.libelle_evenement,
            mode_ecriture: config.mode_ecriture || 'DIRECT',
            condition_reglement: conditionValue,
            type_vente: typeOpValue, 
            lignes: config.lignes.map(l => ({
                id: l.id,
                journal_id: l.journal_id, 
                num_compte: l.numero_compte,
                is_tiers: l.is_tiers || 0,
                sens: l.sens,
                base_calcul: l.colonne_source
            }))
        });
        setActiveTab('config');
    };

    const handleSave = async () => {
        if (isFormInvalid) {
            triggerToast("Données incomplètes : Vérifiez les journaux, comptes et sources !", "error");
            return;
        }

        setLoading(true);
        try {
            const payload = {
                code_evenement: evenement.code_evenement.toUpperCase(),
                libelle_evenement: evenement.libelles,
                table_source: selectedTable,
                mode_ecriture: evenement.mode_ecriture,
                type_operation: evenement.type_operation || evenement.type_vente, // Ajustement de sécurité
                condition_reglement: evenement.condition_reglement, 
                lignes: evenement.lignes.map(l => {
                    const cRef = comptes.find(c => c.numero_compte === l.num_compte);
                    return {
                        label_ligne: evenement.libelles,
                        journal_id: l.journal_id, 
                        compte_id: cRef ? cRef.id : null,
                        sens: l.sens,
                        colonne_source: l.base_calcul,
                        is_tiers: l.is_tiers 
                    };
                })
            };

            await API.post('/config-compta/schema-dynamique', payload);
            triggerToast("Configuration Dispatcher enregistrée !");
            
            setTimeout(async () => {
                await loadExistingConfigs();
                setEvenement(initialEvenement);
                setActiveTab('list');
            }, 1000);

        } catch (err) { 
            triggerToast(err.response?.data?.error || err.message, "error");
        } finally { 
            setLoading(false); 
        }
    };

    const handleDeleteConfig = (cfg) => {
        if (!canModifySchema) {
            return triggerToast("🛑 ACCÈS REFUSÉ : Privilège de suppression de configuration manquant pour votre profil.", "error");
        }

        triggerToast(
            `Voulez-vous vraiment supprimer la configuration [${cfg.code_evenement}] ?`, 
            'confirm', 
            async () => {
                try {
                    await API.delete(`/config-compta/supprimer/${cfg.id}`);
                    triggerToast("Configuration supprimée.");
                    loadExistingConfigs();
                } catch (err) {
                    triggerToast("Erreur lors de la suppression.", "error");
                }
            }
        );
    };

    return (
        <div style={s.layout}>
            <Sidebar />
            <main style={s.main}>
                <header style={s.header}>
                    <div style={{display:'flex', alignItems:'center', gap:'20px'}}>
                        <h1 style={s.title}>MOTEUR COMPTA : {selectedTable.toUpperCase()}</h1>
                        <div style={s.tabGroup}>
                            <button onClick={() => setActiveTab('config')} style={activeTab === 'config' ? s.tabActive : s.tab}><FilePlus size={14}/> CONFIG</button>
                            <button onClick={() => setActiveTab('list')} style={activeTab === 'list' ? s.tabActive : s.tab}><ListIcon size={14}/> LISTE ({existingConfigs.length})</button>
                        </div>
                    </div>
                    <div style={{display:'flex', gap:'10px'}}>
                        
                        {/* Bouton NOUVEAU optimisé */}
                        <button 
                            onClick={() => {
                                if (!canCreateSchema) {
                                    triggerToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission de créer un nouveau schéma d'écriture.", "error");
                                } else {
                                    handleNew();
                                }
                            }} 
                            style={{
                                ...s.btnNew,
                                background: canCreateSchema ? '#2563eb' : '#cbd5e1',
                                color: canCreateSchema ? '#ffffff' : '#64748b',
                                cursor: canCreateSchema ? 'pointer' : 'not-allowed'
                            }}
                        >
                            <Plus size={16}/> {canCreateSchema ? 'NOUVEAU' : 'Accès restreint'}
                        </button>
                        
                        {/* Bouton ENREGISTRER sécurisé visuellement */}
                        <button 
                            onClick={(e) => {
                                if (!canSaveSchema) {
                                    e.preventDefault();
                                    triggerToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'enregistrer ces modifications.", "error");
                                } else {
                                    handleSave();
                                }
                            }} 
                            style={isFormInvalid ? s.btnDisabled : {
                                ...s.btnSave,
                                background: canSaveSchema ? '#10b981' : '#94a3b8',
                                cursor: canSaveSchema ? 'pointer' : 'not-allowed'
                            }}
                        >
                            <Save size={16}/> {loading ? 'TRAITEMENT...' : 'ENREGISTRER'}
                        </button>
                    </div>
                </header>

                <div style={s.contentWrapper}>
                    {/* --- SIDEBAR GAUCHE (SOURCES ERP) --- */}
                    <div style={s.sidebarLeft}>
                        <h3 style={s.sideTitle}>SOURCES ERP</h3>
                        <div style={s.tableList}>
                            {tablesERP.map(t => (
                                <div key={t.id} style={selectedTable === t.id ? s.tableItemActive : s.tableItem} onClick={() => setSelectedTable(t.id)}>
                                    <div style={{display:'flex', alignItems:'center', gap:'10px'}}>{t.icon}<span>{t.label}</span></div>
                                    <ChevronRight size={14} />
                                </div>
                            ))}
                        </div>
                    </div>


                    {/* --- ZONE DE CONFIGURATION --- */}
                    <div style={s.mainConfig}>
                        {activeTab === 'config' ? (
                            <>
                                <div style={s.enteteOrange}>
                                    <div style={s.gridEntete}>
                                        <div style={{flex: 1}}>
                                            <label style={s.label}>CODE DU FLUX</label>
                                            <input style={{...s.input, fontWeight:'bold'}} value={evenement.code_evenement} onChange={e => setEvenement({...evenement, code_evenement: e.target.value.replace(/\s/g, '_').toUpperCase()})} placeholder="Ex: VENTE_CASH" />
                                        </div>
                                        <div style={{flex: 1.5}}>
                                            <label style={s.label}>LIBELLÉ ÉCRITURE</label>
                                            <input style={s.input} value={evenement.libelles} onChange={e => setEvenement({...evenement, libelles: e.target.value})} placeholder="Ex: Vente au comptoir" />
                                        </div>
                                        <div style={{ display: 'flex', gap: '10px' }}>
                                            {/* --- CHAMP CONDITION RÈGLEMENT --- */}
                                            <div style={{ width: '150px' }}>
                                                <label style={{ ...s.label, color: '#2563eb' }}>CONDITION RÈGL.</label>
                                                <select
                                                    style={{ ...s.select, border: '1px solid #2563eb' }}
                                                    value={evenement.condition_reglement}
                                                    onChange={e => setEvenement({ ...evenement, condition_reglement: e.target.value })}
                                                >
                                                    <option value="">-- TOUS --</option>
                                                    <optgroup label="LOGIQUE SYSTÈME">
                                                        <option value="CREDIT">CREDIT</option>
                                                        <option value="ACOMPTE">ACOMPTE</option>
                                                    </optgroup>
                                                    <optgroup label="MOYENS DE PAIEMENT">
                                                        {paymentMethods.map(m => (
                                                            <option key={m.id} value={m.libelle}>{m.libelle}</option>
                                                        ))}
                                                    </optgroup>
                                                </select>
                                            </div>

                                            {/* --- CHAMP TYPE OPÉRATION --- */}
                                            <div style={{ width: '180px' }}>
                                                <label style={{ ...s.label, color: '#059669' }}>TYPE OPÉRATION</label>
                                                <select
                                                    style={{ ...s.select, border: '1px solid #059669' }}
                                                    value={evenement.type_vente}
                                                    onChange={e => setEvenement({ ...evenement, type_vente: e.target.value })}
                                                >
                                                    <option value="">-- TOUS --</option>
                                                    
                                                    <optgroup label="FLUX VENTES">
                                                        <option value="VENTE">VENTE</option>
                                                        <option value="RETOUR">RETOUR (VTE)</option>
                                                        <option value="ANNULEE">ANNULÉE (VTE)</option>
                                                    </optgroup>

                                                    <optgroup label="FLUX ACHATS">
                                                        <option value="ACHAT">ACHAT</option>
                                                        <option value="ANNULATION">ANNULATION (ACH)</option>
                                                        <option value="RETOUR">RETOUR (ACH)</option>
                                                    </optgroup>

                                                    <optgroup label="STOCKS / DIVERS">
                                                        <option value="MOUVEMENT">MOUVEMENT</option>
                                                    </optgroup>
                                                </select>
                                            </div>
                                        </div>

                                                                             <div style={{width:'120px'}}>
                                            <label style={s.label}>POSTAGE</label>
                                            <select style={s.select} value={evenement.mode_ecriture} onChange={e => setEvenement({...evenement, mode_ecriture: e.target.value})}>
                                                <option value="DIRECT">DIRECT</option>
                                                <option value="BROUILLON">BROUILLON</option>
                                            </select>
                                        </div>
                                    </div>
                                </div>

                                <div style={s.configCard}>
                                    <div style={s.cardHeader}>
                                        <h3 style={s.sectionTitle}>SCHÉMA DES IMPUTATIONS (DISPATCHER)</h3>
                                        
                                        {/* 🔑 MAPPAGE DYNAMIQUE DU BOUTON AJOUTER LIGNE SANS ATTRIBUT DISABLED STRICT */}
                                        <button 
                                            onClick={() => {
                                                if (!canAddSchemaLine) {
                                                    triggerToast("🛑 ACCÈS REFUSÉ : Votre profil ne détient pas la permission d'ajouter une ligne d'imputation comptable.", "error");
                                                } else {
                                                    addLine();
                                                }
                                            }} 
                                            style={{
                                                ...s.btnAddSmall,
                                                background: canAddSchemaLine ? '#2563eb' : '#cbd5e1',
                                                color: canAddSchemaLine ? '#ffffff' : '#64748b',
                                                cursor: 'pointer'
                                            }}
                                        >
                                            <Plus size={14}/> {canAddSchemaLine ? "Ajouter ligne" : "Bloqué"}
                                        </button>
                                    </div>
                                    <div style={s.scrollContainer}>
                                        <table style={s.table}>
                                            <thead style={s.stickyThead}>
                                                <tr style={s.thead}>
                                                    <th style={{padding:'12px', width: '150px'}}>JOURNAL *</th>
                                                    <th style={{width: '200px'}}>N° COMPTE *</th>
                                                    <th style={{width: '70px', textAlign:'center'}}>TIERS</th>
                                                    <th style={{width: '90px'}}>SENS</th>
                                                    <th>SOURCE MONTANT *</th>
                                                    <th style={{width: '50px'}}></th>
                                                </tr>
                                            </thead>
                                            <tbody>

                                                                                             {evenement.lignes.map(l => (
                                                    <tr key={l.id} style={s.tr}>
                                                        <td>
                                                            <select 
                                                                style={{...s.tableSelect, border: !l.journal_id ? '1px solid #ef4444' : '1px solid #e2e8f0', fontWeight:'bold'}} 
                                                                value={l.journal_id} 
                                                                onChange={e => updateLine(l.id, 'journal_id', e.target.value)}
                                                                disabled={!canAddSchemaLine}
                                                            >
                                                                <option value="">CHOISIR...</option>
                                                                {journaux.map(j => <option key={j.id} value={j.id}>{j.code}</option>)}
                                                            </select>
                                                        </td>
                                                        <td style={{ position: 'relative' }}>
                                                            <input
                                                                style={{ ...s.tableInput, border: !l.num_compte ? '1px solid #ef4444' : '1px solid #e2e8f0' }}
                                                                value={l.num_compte}
                                                                onChange={e => handleCompteChange(l.id, e.target.value)}
                                                                placeholder="Rechercher..."
                                                                readOnly={!canAddSchemaLine}
                                                            />
                                                            {activeSuggestion.lineId === l.id && activeSuggestion.results.length > 0 && (
                                                                <div style={s.suggestionBox}>
                                                                    {activeSuggestion.results.map(c => (
                                                                        <div
                                                                            key={c.id}
                                                                            style={s.suggestionItem}
                                                                            onMouseDown={(e) => {
                                                                                e.preventDefault(); 
                                                                                selectCompte(l.id, c.numero_compte);
                                                                            }}
                                                                        >
                                                                            <strong>{c.numero_compte}</strong> - {c.intitule}
                                                                        </div>
                                                                    ))}
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td style={{textAlign:'center'}}>
                                                            {isTiersAccount(l.num_compte) ? (
                                                                <div style={{display:'flex', flexDirection:'column', alignItems:'center'}}>
                                                                    <input type="checkbox" checked={l.is_tiers === 1} disabled={!canAddSchemaLine} onChange={e => updateLine(l.id, 'is_tiers', e.target.checked ? 1 : 0)} />
                                                                    <span style={{fontSize:'7px', fontWeight:'900', color:'#2563eb'}}>AUTO</span>
                                                                </div>
                                                            ) : <Lock size={12} style={{color:'#cbd5e1'}} />}
                                                        </td>
                                                        <td>
                                                            <select style={s.tableSelect} value={l.sens} disabled={!canAddSchemaLine} onChange={e => updateLine(l.id, 'sens', e.target.value)}>
                                                                <option value="DEBIT">DÉBIT</option>
                                                                <option value="CREDIT">CRÉDIT</option>
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <select 
                                                                style={{...s.tableSelect, border: !l.base_calcul ? '1px solid #ef4444' : '1px solid #e2e8f0'}} 
                                                                value={l.base_calcul} 
                                                                onChange={e => updateLine(l.id, 'base_calcul', e.target.value)}
                                                                disabled={!canAddSchemaLine}
                                                            >
                                                                <option value="">SOURCE MONTANT...</option>
                                                                {tableColumns.map(col => <option key={col} value={col}>{col.toUpperCase()}</option>)}
                                                            </select>
                                                        </td>
                                                        <td>
                                                            <button 
                                                                onClick={() => {
                                                                    if (!canAddSchemaLine) {
                                                                        triggerToast("🛑 ACCÈS REFUSÉ : Action de suppression de ligne bloquée.", "error");
                                                                    } else {
                                                                        setEvenement({...evenement, lignes: evenement.lignes.filter(x => x.id !== l.id)});
                                                                    }
                                                                }} 
                                                                style={{
                                                                    ...s.btnDel,
                                                                    opacity: canAddSchemaLine ? 1 : 0.4,
                                                                    cursor: canAddSchemaLine ? 'pointer' : 'not-allowed'
                                                                }}
                                                            >
                                                                <Trash2 size={12}/>
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                </div>
                            </>
                        ) : (

                                                           <div style={s.configCard}>
                                <div style={s.cardHeader}><h3 style={s.sectionTitle}>CONFIGURATIONS ENREGISTRÉES</h3></div>
                                <div style={s.scrollContainer}>
                                    <table style={s.table}>
                                        <thead style={s.thead}><tr><th style={{padding:'12px'}}>CODE</th><th>LIBELLÉ</th><th>CONDITION</th><th>MODE</th><th style={{width:'150px'}}>ACTIONS</th></tr></thead>
                                        <tbody>
                                            {existingConfigs.length > 0 ? existingConfigs.map(cfg => {
                                                // Vérification si l'utilisateur possède la permission de modification sur la ligne
                                                const hasRowAccess = canModifySchema;

                                                return (
                                                    <tr key={cfg.id} style={s.tr}>
                                                        <td style={{padding:'12px', fontWeight:'bold'}}>{cfg.code_evenement}</td>
                                                        <td>{cfg.libelle_evenement}</td>
                                                        <td style={{color:'#2563eb', fontWeight:'600'}}>{cfg.condition_reglement || 'TOUS'}</td>
                                                        <td>{cfg.mode_ecriture}</td>
                                                        <td>
                                                            <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
                                                                
                                                                {/* 🔑 MAPPAGE DU BOUTON EDITER : Affiché uniquement si autorisé */}
                                                                {canModifySchema && (
                                                                    <button onClick={() => handleEdit(cfg)} style={{...s.btnNew, padding:'4px 8px', fontSize:'10px', marginRight:'5px'}}>
                                                                        Editer
                                                                    </button>
                                                                )}

                                                                {/* 🔑 MAPPAGE DU BOUTON SUPPRIMER : Affiché uniquement si autorisé */}
                                                                {canModifySchema && (
                                                                    <button onClick={() => handleDeleteConfig(cfg)} style={s.btnDel} title="Supprimer la configuration">
                                                                        <Trash2 size={12}/>
                                                                    </button>
                                                                )}

                                                                {/* 🔒 SÉCURITÉ VISUELLE INTERNE : S'affiche si la permission est absente */}
                                                                {!hasRowAccess && (
                                                                    <span style={{ fontSize: '11px', color: '#64748b', fontStyle: 'italic', fontWeight: '500' }}>
                                                                        Accès restreint
                                                                    </span>
                                                                )}

                                                            </div>
                                                        </td>
                                                    </tr>
                                                );
                                            }) : <tr><td colSpan="5" style={{textAlign:'center', padding:'20px', color:'#94a3b8'}}>Aucun paramétrage trouvé.</td></tr>}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* --- TOAST --- */}
                {toast.show && (
                    <div style={{
                        ...s.toastContainer, 
                        backgroundColor: toast.type === 'error' ? '#ef4444' : toast.type === 'confirm' ? '#1e293b' : '#10b981'
                    }}>
                        <div style={s.toastBody}>
                            <div style={{display:'flex', alignItems:'center', gap:'12px'}}>
                                {toast.type === 'error' && <AlertCircle size={20} />}
                                {toast.type === 'success' && <CheckCircle size={20} />}
                                {toast.type === 'confirm' && <HelpCircle size={20} color="#f59e0b" />}
                                <span style={{fontSize:'12px', fontWeight:'600'}}>{toast.msg}</span>
                            </div>
                            {toast.type === 'confirm' && (
                                <div style={{display:'flex', gap:'8px', marginTop:'12px', justifyContent:'flex-end'}}>
                                    <button onClick={closeToast} style={s.btnToastCancel}>ANNULER</button>
                                    <button onClick={() => { toast.onConfirm(); closeToast(); }} style={s.btnToastConfirm}>SUPPRIMER</button>
                                </div>
                            )}
                            {toast.type !== 'confirm' && <X size={16} onClick={closeToast} style={{cursor:'pointer', marginLeft:'10px'}} />}
                        </div>
                    </div>
                )}
            </main>
        </div>
    );
};


// --- STYLES (Conservés à l'identique) ---
const s = {
    // Dans ton objet s :
btnReset: {
  background: '#f1f5f9',
  color: '#64748b',
  border: 'none',
  padding: '8px 15px',
  borderRadius: '8px',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  transition: 'all 0.2s'
},
    layout: { display: 'flex', height: '100vh', background: '#f1f5f9', overflow:'hidden' },
    main: { flex: 1, display: 'flex', flexDirection: 'column' },
    header: { background: 'white', padding: '12px 25px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    title: { fontSize: '13px', fontWeight: '900', color: '#1e293b' },
    tabGroup: { display:'flex', background:'#f1f5f9', padding:'3px', borderRadius:'6px', gap:'3px' },
    tab: { border:'none', background:'none', padding:'5px 10px', fontSize:'10px', fontWeight:'700', cursor:'pointer', color:'#64748b' },
    tabActive: { border:'none', background:'white', padding:'5px 10px', fontSize:'10px', fontWeight:'800', cursor:'pointer', color:'#2563eb', borderRadius:'5px', boxShadow:'0 2px 4px rgba(0,0,0,0.05)' },
    contentWrapper: { display: 'flex', padding: '15px', gap: '15px', flex: 1, overflow: 'hidden' },
    sidebarLeft: { width: '230px', flexShrink: 0 },
    sideTitle: { fontSize: '9px', fontWeight: '900', color: '#64748b', marginBottom: '8px', textTransform:'uppercase' },
    tableList: { background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', overflow: 'hidden' },
    tableItem: { padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', fontSize:'11px' },
    tableItemActive: { padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: '#2563eb', color: 'white', fontWeight:'700' },
    mainConfig: { flex: 1, display: 'flex', flexDirection: 'column', gap: '12px', overflow: 'hidden' },
    enteteOrange: { background: '#fff7ed', padding: '12px', borderRadius: '8px', border: '1px solid #fed7aa' },
    gridEntete: { display: 'flex', gap: '12px', alignItems: 'flex-end' },
    label: { display: 'block', fontSize: '9px', fontWeight: '900', color: '#9a3412', marginBottom: '4px', textTransform:'uppercase' },
    input: { width: '100%', padding: '7px', borderRadius: '5px', border: '1px solid #fed7aa', fontSize:'12px' },
    select: { width: '100%', padding: '7px', borderRadius: '5px', border: '1px solid #fed7aa', background: 'white', fontSize:'12px' },
    configCard: { background: 'white', borderRadius: '8px', border: '1px solid #e2e8f0', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' },
    cardHeader: { padding: '10px 15px', borderBottom: '1px solid #f1f5f9', display:'flex', justifyContent:'space-between', alignItems:'center', background: '#f8fafc' },
    scrollContainer: { flex: 1, overflowY: 'auto' },
    table: { width: '100%', borderCollapse: 'collapse' },
    thead: { background: '#f8fafc', textAlign: 'left', fontSize: '10px', fontWeight: '900', color: '#64748b', position:'sticky', top:0 },
    tr: { borderBottom: '1px solid #f1f5f9' },
    tableInput: { width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '12px' },
    tableSelect: { width: '100%', padding: '6px', border: '1px solid #e2e8f0', borderRadius: '4px', fontSize: '11px' },
    btnSave: { background: '#059669', color: 'white', border: 'none', padding: '7px 15px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', gap: '6px', fontSize: '11px' },
    btnDisabled: { background: '#cbd5e1', color: '#94a3b8', border: 'none', padding: '7px 15px', borderRadius: '6px', fontWeight: '800', cursor: 'not-allowed', display: 'flex', gap: '6px', fontSize: '11px' },
    btnNew: { background: '#2563eb', color: 'white', border: 'none', padding: '7px 15px', borderRadius: '6px', fontWeight: '800', cursor: 'pointer', display: 'flex', gap: '6px', fontSize: '11px' },
    btnDel: { background: '#fee2e2', color: '#b91c1c', border: 'none', padding: '5px', borderRadius: '4px', cursor: 'pointer' },
    btnAddSmall: { background: '#2563eb', color: 'white', padding: '5px 10px', borderRadius: '5px', fontSize:'9px', fontWeight:'700', border:'none', cursor:'pointer' },
    suggestionBox: { position: 'absolute', top: '100%', left: 0, width: '400px', background: 'white', border: '1px solid #cbd5e1', zIndex: 5000, maxHeight: '220px', overflowY: 'auto', borderRadius: '8px', boxShadow: '0 10px 25px rgba(0,0,0,0.15)', marginTop: '2px' },
    suggestionItem: { padding: '10px 15px', borderBottom: '1px solid #f1f5f9', cursor: 'pointer', fontSize: '11px', display: 'flex', gap: '8px', color: '#334155' },
    toastContainer: { position: 'fixed', bottom: '30px', right: '30px', color: 'white', padding: '16px 20px', borderRadius: '12px', zIndex: 10000, boxShadow: '0 20px 40px rgba(0,0,0,0.3)', minWidth: '300px' },
    toastBody: { display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
    btnToastCancel: { background: 'transparent', border: '1px solid white', color: 'white', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' },
    btnToastConfirm: { background: '#ef4444', border: 'none', color: 'white', padding: '6px 12px', borderRadius: '6px', fontSize: '10px', fontWeight: 'bold', cursor: 'pointer' },
};

export default ConfigEvenementDynamique;