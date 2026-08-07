import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next'; // Hook de traduction des textes
import i18nInstance from '../locales/i18n'; // Import direct de l'instance pour sécuriser Electron
import { 
  ArrowRight, LogIn, ShieldCheck, Cpu, Sun, Moon, X, CheckCircle2, Languages, Coins,
  ShoppingCart, BarChart3, Users, Wallet, PieChart, CreditCard, UserRound, ChevronRight, ChevronLeft, Target, GraduationCap
} from 'lucide-react';
import logoImg from './assets/logo.png';

import './Welcome.css';

const Welcome = () => {
  const navigate = useNavigate();
  const { t } = useTranslation(); // Utilisation de t pour traduire les chaînes textuelles
  const [machineId, setMachineId] = useState('Analyse matérielle en cours...');
  
  // ✅ Initialisation synchrone basée sur le localStorage pour éviter les sauts de couleur
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const savedTheme = localStorage.getItem('erp_theme');
    return savedTheme ? savedTheme === 'dark' : true;
  });

  // ✅ Initialisation synchrone de la devise commerciale globale
  const [currency, setCurrency] = useState(() => {
    return localStorage.getItem('erp_currency') || 'XOF';
  });
  
  const [currentSlide, setCurrentSlide] = useState(0);
  const [activeModal, setActiveModal] = useState(null);
  const autoPlayRef = useRef(null);

  // 📦 Catalogue complet d'origine avec identifiant module brut pour la traduction dynamique en direct
  const services = [
    { 
      moduleKey: "pos",
      icon: <ShoppingCart size={36} />, 
      title: 'Terminal Point de Vente (POS)', 
      desc: 'Ventes au comptoir, paniers en attente, encaissements rapides et facturation normalisée.', 
      color: "#4318ff",
      featuresKeys: ["pos_0", "pos_1", "pos_2", "pos_3", "pos_4"]
    },
    { 
      moduleKey: "stocks",
      icon: <BarChart3 size={36} />, 
      title: 'Gestion des Stocks & Achats', 
      desc: 'Suivi des articles en temps réel, alertes de rupture, inventaires et dettes fournisseurs.', 
      color: "#00b5d8",
      featuresKeys: ["stocks_0", "stocks_1", "stocks_2", "stocks_3", "stocks_4"]
    },
    { 
      moduleKey: "compta",
      icon: <Wallet size={36} />, 
      title: 'Comptabilité Générale', 
      desc: 'Saisie journalière, plan comptable Syscohada/OHADA, balances et états financiers.', 
      color: "#10b981",
      featuresKeys: ["compta_0", "compta_1", "compta_2", "compta_3", "compta_4"]
    },
    { 
      moduleKey: "analytique",
      icon: <Target size={36} />, 
      title: 'Gestion Analytique & Budgétaire', 
      desc: 'Suivi des centres de coûts, élaboration des budgets prévisionnels, calcul des écarts et rentabilité par projet.', 
      color: "#0284c7",
      featuresKeys: ["analytique_0", "analytique_1", "analytique_2", "analytique_3", "analytique_4"]
    },
    { 
      moduleKey: "scolaire",
      icon: <GraduationCap size={36} />, 
      title: 'Gestion Scolaire & Académique', 
      desc: 'Suivi des inscriptions, gestion des classes, emploi du temps, cahier de texte numérique, notes et bulletins scolaires.', 
      color: "#14b8a6",
      featuresKeys: ["scolaire_0", "scolaire_1", "scolaire_2", "scolaire_3", "scolaire_4"]
    },
    { 
      moduleKey: "immo",
      icon: <PieChart size={36} />, 
      title: 'Gestion des Immobilisations', 
      desc: "Suivi du parc d'actifs, calcul automatique des amortissements (linéaire/dégressif) et fiches d'inventaire.", 
      color: "#f59e0b",
      featuresKeys: ["immo_0", "immo_1", "immo_2", "immo_3", "immo_4"]
    },
    { 
      moduleKey: "paie",
      icon: <CreditCard size={36} />, 
      title: 'Gestion de la Paie', 
      desc: "Calcul des salaires, édition des bulletins de paie, gestion des primes, taxes, avances et acomptes.", 
      color: "#ef4444",
      featuresKeys: ["paie_0", "paie_1", "paie_2", "paie_3", "paie_4"]
    },
    { 
      moduleKey: "rh",
      icon: <Users size={36} />, 
      title: 'Ressources Humaines (RH)', 
      desc: "Suivi du personnel, gestion des absences, contrats de travail, congés et organigramme.", 
      color: "#ec4899",
      featuresKeys: ["rh_0", "rh_1", "rh_2", "rh_3", "rh_4"]
    },
    { 
      moduleKey: "rbac",
      icon: <UserRound size={36} />, 
      title: 'Sécurité & Profils (RBAC)', 
      desc: "Contrôle d'accès strict par collaborateur et traçabilité totale via le journal d'audit.", 
      color: "#7c3aed",
      featuresKeys: ["rbac_0", "rbac_1", "rbac_2", "rbac_3", "rbac_4"]
    }
  ];

  // ✅ Fonction de bascule de langue robuste utilisant l'instance globale directe
  const switchLanguage = (langCode) => {
    i18nInstance.changeLanguage(langCode);
  };

  // ✅ Fonction de bascule de devise si présente
  const switchCurrency = (currencyCode) => {
    setCurrency(currencyCode);
    localStorage.setItem('erp_currency', currencyCode);
    window.dispatchEvent(new Event('storage'));
  };

  // ✅ Fix de synchronisation du thème
  useEffect(() => {
    const theme = isDarkMode ? 'dark' : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('erp_theme', theme);
  }, [isDarkMode]);

  // Récupération sécurisée du MID d'Electron
  useEffect(() => {
    if (window.electronAPI && typeof window.electronAPI.getMachineId === 'function') {
      window.electronAPI.getMachineId()
        .then(id => id ? setMachineId(id) : setMachineId('En attente du signal matériel...'))
        .catch(() => setMachineId('Erreur d\'identification physique'));
    } else {
      setMachineId('MID-SIMULE-DEV-MODE-CHROME-6290642E46BFC1A0');
    }
  }, []);

  const nextSlide = () => {
    setCurrentSlide((prev) => (prev === services.length - 1 ? 0 : prev + 1));
  };

  const prevSlide = () => {
    setCurrentSlide((prev) => (prev === 0 ? services.length - 1 : prev - 1));
  };

  // Gestion de la boucle d'auto-play du diaporama
  useEffect(() => {
    if (activeModal !== null) return;
    autoPlayRef.current = nextSlide;
  });

  useEffect(() => {
    if (activeModal !== null) return;
    const play = () => { autoPlayRef.current(); };
    const interval = setInterval(play, 5000);
    return () => clearInterval(interval);
  }, [activeModal]);

  return (
    <div className="welcome-wrapper">
      
      {/* ================= 🎛️ CONTROLES GLOBAUX REGROUPÉS (HAUT GAUCHE) ================= */}
      <div className="global-controls-container">
        {/* Switch de Thème Sombre / Clair */}
        <button className="control-icon-btn" onClick={() => setIsDarkMode(!isDarkMode)} title="Changer de thème">
          {isDarkMode ? <Sun size={18} color="#f59e0b" /> : <Moon size={18} />}
        </button>

        {/* Sélecteur de Langue Mondial Sécurisé */}
        <div className="dropdown-control-wrapper">
          <Languages size={18} className="control-icon" />
          <select 
            value={i18nInstance.language ? i18nInstance.language.substring(0, 2) : 'fr'} 
            onChange={(e) => switchLanguage(e.target.value)}
          >
            <option value="fr">FR</option>
            <option value="en">EN</option>
          </select>
        </div>

              {/* Sélecteur de Devise Universel */}
        <div className="dropdown-control-wrapper">
          <Coins size={18} className="control-icon" />
          <select value={currency} onChange={(e) => switchCurrency(e.target.value)}>
            <option value="XOF">XOF (CFA)</option>
            <option value="USD">USD ($)</option>
            <option value="EUR">EUR (€)</option>
            <option value="GNF">GNF (FG)</option>
          </select>
        </div>
      </div>

      {/* ================= SECTION GAUCHE : HERO ================= */}
      <section className="welcome-hero-panel">
        <div className="hero-panel-content">
          <div className="brand-container">
            <img src={logoImg} alt="LEDI EXPERT PRO Logo" className="logo-welcome" />
          </div>

          <div className="hardware-badge">
            <Cpu size={14} className="pulse-slow" />
            <span>{machineId}</span>
          </div>

          <div className="hero-main-text">
            <h1 className="hero-title">
              {t('welcome.hero_title', 'Votre ERP Commercial & Comptable')} <br/><span>Local-First</span>
            </h1>
            <p className="hero-subtitle">
              {t('welcome.hero_subtitle', 'Pilotez votre entreprise en toute indépendance. Performance maximale et sécurité locale absolue.')}
            </p>
          </div>

          <div className="welcome-actions-group">
            <button onClick={() => navigate('/signup')} className="btn-welcome-primary">
              {t('welcome.btn_create', 'Créer ma Société')} <ArrowRight size={16} />
            </button>
            <button onClick={() => navigate('/login')} className="btn-welcome-secondary">
              <LogIn size={16} /> {t('welcome.btn_login', 'Ouvrir ma session')}
            </button>
          </div>
        </div>
      </section>

      {/* ================= SECTION DROITE : DIAPORAMA INTERACTIF 3D ================= */}
      <section className="welcome-slider-panel">
        <div className="slider-header">
          <h2>{t('welcome.slider_title', 'Une suite logicielle interconnectée')}</h2>
          <p>{t('welcome.slider_subtitle', 'Cliquez sur une carte pour explorer les spécifications détaillées')}</p>
        </div>

        <div className="slider-container">
          <button className="nav-arrow prev" onClick={prevSlide} aria-label="Précédent">
            <ChevronLeft size={24} />
          </button>
          
          <div className="slider-viewport">
            {/* ✅ Traduction dynamique forcée lors de la re-génération du carrousel */}
            {services.map((srv, idx) => (
              <div 
                key={idx} 
                className={`slide-card ${idx === currentSlide ? 'active' : ''}`}
                style={{ '--accent-color': srv.color }}
                onClick={() => idx === currentSlide && setActiveModal(srv)}
              >
                <div className="slide-icon-box">
                  {srv.icon}
                </div>
                <h3>{t(`welcome.services.${srv.moduleKey}_title`, srv.title)}</h3>
                <p>{t(`welcome.services.${srv.moduleKey}_desc`, srv.desc)}</p>
                <span className="click-indicator">{t('welcome.click_expand', 'Cliquer pour agrandir')}</span>
              </div>
            ))}
          </div>

          <button className="nav-arrow next" onClick={nextSlide} aria-label="Suivant">
            <ChevronRight size={24} />
          </button>
        </div>

        <div className="slider-dots">
          {services.map((_, idx) => (
            <button 
              key={idx} 
              className={`dot ${idx === currentSlide ? 'active' : ''}`}
              onClick={() => setCurrentSlide(idx)}
              aria-label={`Aller à la diapositive ${idx + 1}`}
            />
          ))}
        </div>

        <div className="security-footer-badge">
          <ShieldCheck size={14} color="#10b981" /> Architecture chiffrée par blocs (SQLCipher v4) adossée à la signature de ce PC.
        </div>
      </section>

      {/* ================= PANNEAU VUE GRAND FORMAT VERTICAL (MODAL) ================= */}
      {activeModal && (
        <div className="details-overlay" onClick={() => setActiveModal(null)}>
          <div className="details-modal" style={{ '--modal-accent': activeModal.color }} onClick={(e) => e.stopPropagation()}>
            <button className="close-modal-btn" onClick={() => setActiveModal(null)} aria-label="Fermer">
              <X size={24} />
            </button>
            
            <div className="modal-header-sticky">
              <div className="modal-icon-box" style={{ color: activeModal.color, backgroundColor: `${activeModal.color}15` }}>
                {activeModal.icon}
              </div>
              {/* ✅ Traduction dynamique forcée du titre et descriptif de l'en-tête de la modale */}
              <h2>{t(`welcome.services.${activeModal.moduleKey}_title`, activeModal.title)}</h2>
              <p className="modal-main-desc">{t(`welcome.services.${activeModal.moduleKey}_desc`, activeModal.desc)}</p>
            </div>

            <div className="modal-scroll-content">
              <h3>{t('welcome.modal_title', 'Spécifications & Fonctionnalités Techniques')}</h3>
              <div className="details-points-list">
                {activeModal.featuresKeys && activeModal.featuresKeys.map((key, index) => (
                  <div key={index} className="detail-item-row">
                    <CheckCircle2 size={20} className="detail-check-icon" style={{ color: activeModal.color }} />
                    <p>{t(`welcome.features.${key}`)}</p>
                  </div>
                ))}
              </div>
              
              <div className="modal-cta-box">
                <p>{t('welcome.modal_cta', "Ce module est nativement pré-installé et synchronisé avec le cœur de l'ERP local.")}</p>
                <button onClick={() => { setActiveModal(null); navigate('/signup'); }} className="btn-welcome-primary">
                  {t('welcome.modal_btn_deploy', 'Déployer ce module maintenant')} <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
};

export default Welcome;
