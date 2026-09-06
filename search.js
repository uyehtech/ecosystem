    // ========== GET ALL ELEMENTS ==========
   
 
    const searchBtn = document.getElementById('searchBtn');
    const searchClose = document.getElementById('searchClose');
    const searchInput = document.getElementById('searchInput');
    const nav = document.querySelector('nav');



    // ========== SEARCH DATABASE ==========
    const searchDatabase = [
        // PAGES
        {
            id: 1,
            title: "Home - Uyeh Tech",
            url: "index.html",
            category: "Page",
            description: "Welcome to Uyeh Tech. Full Stack Developer creating modern websites and applications.",
            keywords: ["home", "welcome", "portfolio", "developer", "bassey okon", "uyeh tech"]
        },
        {
            id: 2,
            title: "About - Bassey Okon",
            url: "about.html",
            category: "Page",
            description: "Learn more about Bassey Okon, a passionate Full Stack Developer from Nigeria with 5+ years experience.",
            keywords: ["about", "biography", "skills", "experience", "education", "bassey", "okon", "developer"]
        },
        {
            id: 3,
            title: "Services & Pricing",
            url: "services.html",
            category: "Page",
            description: "Web development, mobile apps, UI/UX design, e-commerce, and maintenance services with transparent pricing.",
            keywords: ["services", "pricing", "web development", "mobile apps", "ui ux design", "ecommerce", "maintenance", "seo"]
        },
        {
            id: 4,
            title: "Projects Portfolio",
            url: "projects.html",
            category: "Page",
            description: "View my portfolio of completed projects including web applications, mobile apps, and websites.",
            keywords: ["projects", "portfolio", "work", "case studies", "examples", "demos"]
        },
        {
            id: 5,
            title: "Blog & Articles",
            url: "blogs.html",
            category: "Page",
            description: "Read articles about web development, JavaScript, React, and modern development practices.",
            keywords: ["blog", "articles", "tutorials", "web development", "javascript", "react", "css"]
        },
        {
            id: 6,
            title: "Contact Us",
            url: "contact.html",
            category: "Page",
            description: "Get in touch via email, WhatsApp, or social media. Free consultation available.",
            keywords: ["contact", "email", "phone", "whatsapp", "consultation", "hire", "get in touch"]
        },   

        {
            id: 7,
            title: "Web Development",
            url: "services.html#web-development",
            category: "Service",
            description: "Custom responsive websites built with modern technologies. Starting from $299.",
            keywords: ["web development", "website", "html", "css", "javascript", "react", "responsive"]
        },
        {
            id: 8,
            title: "Mobile App Development",
            url: "services.html#mobile-apps",
            category: "Service",
            description: "Native and hybrid mobile applications for iOS and Android.",
            keywords: ["mobile apps", "android", "ios", "react native", "flutter", "app development"]
        },
        {
            id: 9,
            title: "UI/UX Design",
            url: "services.html#ui-ux-design",
            category: "Service",
            description: "Beautiful, user-friendly interfaces. Starting from $199.",
            keywords: ["ui design", "ux design", "user interface", "user experience", "figma", "design"]
        },
        {
            id: 10,
            title: "E-commerce Solutions",
            url: "services.html#ecommerce",
            category: "Service",
            description: "Online stores with payment gateway integration. Starting from $799.",
            keywords: ["ecommerce", "online store", "shopping cart", "payment gateway", "shop", "store"]
        },
        {
            id: 11,
            title: "Website Maintenance",
            url: "services.html#maintenance",
            category: "Service",
            description: "Updates, support, and ongoing optimization. $50/month.",
            keywords: ["maintenance", "support", "updates", "hosting", "optimization"]
        },
        {
            id: 12,
            title: "SEO & Marketing",
            url: "services.html#seo",
            category: "Service",
            description: "Get found on Google and grow your online presence. Starting from $150.",
            keywords: ["seo", "marketing", "google", "optimization", "traffic", "ranking"]
        },
    

        {
            id: 13,
            title: "Uyeh Subscription Platform",
            url: "projects.html#uyeh-subscription",
            category: "Project",
            description: "Virtual top-up platform for data, airtime, cable TV, and electricity bills.",
            keywords: ["subscription", "bills", "payment", "react", "nodejs", "mongodb"]
        },
        {
            id: 14,
            title: "Oxygen Hotel",
            url: "projects.html#oxygen-hotel",
            category: "Project",
            description: "Hotel booking website with payment gateway integration.",
            keywords: ["hotel", "booking", "reservation", "payment", "php", "javascript"]
        },
 
    

        {
            id: 15,
            title: "5 Tips for Modern Web Design",
            url: "blogs.html#modern-web-design",
            category: "Blog",
            description: "Learn how to create responsive, stunning websites that engage users.",
            keywords: ["web design", "responsive", "tips", "modern", "ui", "ux"]
        },
        {
            id: 16,
            title: "Understanding JavaScript ES6",
            url: "blogs.html#javascript-es6",
            category: "Blog",
            description: "Essential JavaScript features every developer should know.",
            keywords: ["javascript", "es6", "programming", "development", "tutorial"]
        },
        {
            id: 17,
            title: "CSS Grid vs Flexbox",
            url: "blogs.html#css-grid-flexbox",
            category: "Blog",
            description: "Understanding when to use CSS Grid and Flexbox for layouts.",
            keywords: ["css", "grid", "flexbox", "layout", "responsive", "design"]
        },
        
        // EXTERNAL LINKS
        {
            title: "GitHub",
            description: "View our code repositories",
            keywords: ["github", "code", "repository"],
            url: "https://github.com",
            category: "external",
            external: true
        },
        {
            title: "LinkedIn",
            description: "Connect with us professionally",
            keywords: ["linkedin", "professional", "network"],
            url: "https://linkedin.com",
            category: "external",
            external: true
        }
    ];

    // ========== SEARCH FUNCTION ==========
    function performSearch(query) {
        const searchTerm = query.toLowerCase().trim();
        
        if (!searchTerm) return [];
        
        return searchDatabase.filter(item => {
            const titleMatch = item.title.toLowerCase().includes(searchTerm);
            const descMatch = item.description.toLowerCase().includes(searchTerm);
            const keywordMatch = item.keywords.some(k => k.toLowerCase().includes(searchTerm));
            
            return titleMatch || descMatch || keywordMatch;
        });
    }

    // ========== DISPLAY RESULTS ==========
    function displayResults(results, query) {
        // Remove existing modal
        const existing = document.getElementById('searchModal');
        if (existing) existing.remove();

        // Create modal
        const modal = document.createElement('div');
        modal.id = 'searchModal';
        modal.className = 'search-modal';
        
        modal.innerHTML = `
            <div class="search-overlay" onclick="closeSearchModal()"></div>
            <div class="search-results-box">
                <div class="search-header">
                    <h2>Results for "${query}"</h2>
                    <button class="close-modal" onclick="closeSearchModal()">✕</button>
                </div>
                <div class="search-results">
                    ${results.length > 0 ? results.map(item => `
                        <div class="result-item">
                            <div class="result-icon">${getIcon(item.category)}</div>
                            <div class="result-content">
                                <h3>${item.title}</h3>
                                <p>${item.description}</p>
                                <span class="badge">${item.category}</span>
                            </div>
                            <a href="${item.url}" class="result-btn" ${item.external ? 'target="_blank"' : ''}>
                                ${item.external ? '↗' : '→'}
                            </a>
                        </div>
                    `).join('') : `
                        <div class="no-results">
                            <div class="no-results-icon">🔍</div>
                            <h3>No results found</h3>
                            <p>Try different keywords</p>
                        </div>
                    `}
                </div>
            </div>
        `;

        document.body.appendChild(modal);
        setTimeout(() => modal.classList.add('active'), 10);
        
        // Add styles
        addModalStyles();
    }

    // ========== GET CATEGORY ICON ==========
    function getIcon(category) {
        const icons = {
            'page': '📄',
            'service': '⚙️',
            'external': '🔗'
        };
        return icons[category] || '📌';
    }

    // ========== CLOSE MODAL ==========
    window.closeSearchModal = function() {
        const modal = document.getElementById('searchModal');
        if (modal) {
            modal.classList.remove('active');
            setTimeout(() => modal.remove(), 300);
        }
    };

    // ========== ADD MODAL STYLES ==========
    function addModalStyles() {
        if (document.getElementById('searchModalStyles')) return;

        const style = document.createElement('style');
        style.id = 'searchModalStyles';
        style.textContent = `
            .search-modal {
                position: fixed;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                z-index: 10000;
                opacity: 0;
                transition: opacity 0.3s ease;
            }
            .search-modal.active { opacity: 1; }
            .search-overlay {
                position: absolute;
                top: 0;
                left: 0;
                width: 100%;
                height: 100%;
                background: rgba(0, 0, 0, 0.9);
                backdrop-filter: blur(10px);
            }
            .search-results-box {
                position: relative;
                width: 90%;
                max-width: 700px;
                max-height: 80vh;
                margin: 5vh auto;
                background: #0a0a0a;
                border: 2px solid #00ff88;
                border-radius: 20px;
                overflow: hidden;
                box-shadow: 0 20px 60px rgba(0, 255, 136, 0.4);
            }
            .search-header {
                display: flex;
                justify-content: space-between;
                align-items: center;
                padding: 20px 25px;
                background: rgba(0, 255, 136, 0.1);
                border-bottom: 1px solid #00ff88;
            }
            .search-header h2 {
                color: #00ff88;
                font-size: 1.3em;
                margin: 0;
            }
            .close-modal {
                background: rgba(255, 68, 68, 0.2);
                border: 1px solid #ff4444;
                color: #ff4444;
                font-size: 1.5em;
                width: 40px;
                height: 40px;
                border-radius: 50%;
                cursor: pointer;
                transition: all 0.3s ease;
            }
            .close-modal:hover {
                background: rgba(255, 68, 68, 0.3);
                transform: rotate(90deg);
            }
            .search-results {
                padding: 20px;
                max-height: calc(80vh - 80px);
                overflow-y: auto;
            }
            .result-item {
                display: flex;
                align-items: center;
                gap: 15px;
                padding: 15px;
                background: rgba(0, 255, 136, 0.05);
                border: 1px solid rgba(0, 255, 136, 0.2);
                border-radius: 12px;
                margin-bottom: 12px;
                transition: all 0.3s ease;
            }
            .result-item:hover {
                background: rgba(0, 255, 136, 0.1);
                border-color: #00ff88;
                transform: translateX(5px);
            }
            .result-icon {
                font-size: 2em;
                flex-shrink: 0;
            }
            .result-content {
                flex: 1;
            }
            .result-content h3 {
                color: #00ff88;
                margin: 0 0 5px 0;
                font-size: 1.1em;
            }
            .result-content p {
                color: #d1d5db;
                margin: 0 0 8px 0;
                font-size: 0.9em;
            }
            .badge {
                display: inline-block;
                padding: 3px 10px;
                background: rgba(0, 255, 136, 0.2);
                border-radius: 12px;
                color: #00ff88;
                font-size: 0.75em;
                text-transform: uppercase;
            }
            .result-btn {
                padding: 10px 15px;
                background: linear-gradient(135deg, #00b359, #00ff88);
                color: #fff;
                text-decoration: none;
                border-radius: 8px;
                font-weight: bold;
                font-size: 1.2em;
                transition: all 0.3s ease;
            }
            .result-btn:hover {
                transform: translateY(-2px);
                box-shadow: 0 5px 15px rgba(0, 255, 136, 0.5);
            }
            .no-results {
                text-align: center;
                padding: 60px 20px;
            }
            .no-results-icon {
                font-size: 4em;
                margin-bottom: 15px;
            }
            .no-results h3 {
                color: #00ff88;
                font-size: 1.5em;
                margin-bottom: 10px;
            }
            .no-results p {
                color: #d1d5db;
                font-size: 1em;
            }
            @media (max-width: 768px) {
                .search-results-box {
                    width: 95%;
                    margin: 2vh auto;
                }
                .result-item {
                    flex-direction: column;
                    align-items: flex-start;
                }
                .result-btn {
                    width: 100%;
                    text-align: center;
                }
            }
        `;
        document.head.appendChild(style);
    }

    // ========== SEARCH BAR TOGGLE ==========
    searchBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.classList.add('active');
        searchClose.classList.add('active');
        setTimeout(() => searchInput.focus(), 100);
        console.log('🔍 Search opened');
    });

    searchClose.addEventListener('click', (e) => {
        e.stopPropagation();
        searchInput.classList.remove('active');
        searchClose.classList.remove('active');
        searchInput.value = '';
        console.log('❌ Search closed');
    });

    // ========== SEARCH SUBMIT ==========
    searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const query = searchInput.value.trim();
            if (query) {
                console.log('🔍 Searching for:', query);
                const results = performSearch(query);
                displayResults(results, query);
                
                // Close search bar
                searchInput.classList.remove('active');
                searchClose.classList.remove('active');
                searchInput.value = '';
            }
        }
    });

    // ========== CLICK OUTSIDE TO CLOSE ==========
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-container')) {
            searchInput.classList.remove('active');
            searchClose.classList.remove('active');
        }
    });

    searchInput.addEventListener('click', (e) => {
        e.stopPropagation();
    });
