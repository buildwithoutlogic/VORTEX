/* ==========================================================================
   VORTEX SYSTEM ARCHITECTURE
   - User Financial Data Store (UserDataStore) - Real Data Only
   - Progressive First-Time Financial Setup Wizard (SetupWizardController)
   - Real-Time Live Dashboard Renderer & Calculators (DashboardRenderer)
   - In-Place Metric & Transaction Editors (EditMetricModal)
   - Centralized Authentication Store (AuthManager)
   - Reusable Protected Route Guard & SPA Router (AppRouter)
   - 3D Vortex Canvas Animation Player (Public Landing Page)
   ========================================================================== */

/* ==========================================================================
   1. USER FINANCIAL DATA STORE (UserDataStore)
   ==========================================================================
   CRITICAL PRINCIPLE: Never fabricate user financial data.
   All numbers originate from user input or transparent calculations.
   ========================================================================== */

const UserDataStore = {
    getStorageKey() {
        const user = AuthManager.getUser();
        const email = user && user.email ? user.email.toLowerCase().trim() : "default";
        return `vortex_fin_data_${email}`;
    },

    getData() {
        try {
            const raw = localStorage.getItem(this.getStorageKey());
            if (raw) {
                const parsed = JSON.parse(raw);
                if (!parsed.financialProfile) {
                    parsed.financialProfile = {
                        balance: null,
                        monthlyIncome: null,
                        monthlyExpenses: null,
                        savings: null
                    };
                }
                if (!parsed.transactions) parsed.transactions = [];
                if (!parsed.goals) parsed.goals = [];
                return parsed;
            }
        } catch (e) {
            console.error("UserDataStore: Error reading financial data:", e);
        }

        // Clean default structure without fabricated values
        return {
            financialProfile: {
                balance: null,
                monthlyIncome: null,
                monthlyExpenses: null,
                savings: null
            },
            setupCompleted: false,
            financialProfileCompleted: false,
            transactions: [],
            goals: []
        };
    },

    saveData(data) {
        try {
            localStorage.setItem(this.getStorageKey(), JSON.stringify(data));
        } catch (e) {
            console.error("UserDataStore: Error saving financial data:", e);
        }
    },

    hasCompletedSetup() {
        const data = this.getData();
        return Boolean(data.financialProfileCompleted === true || data.setupCompleted === true);
    },

    markSetupCompleted() {
        const data = this.getData();
        data.setupCompleted = true;
        data.financialProfileCompleted = true;
        this.saveData(data);
    },

    updateFinancialMetric(metricKey, value) {
        const data = this.getData();
        const numVal = value !== null && value !== "" && !isNaN(value) ? Number(value) : null;
        data.financialProfile[metricKey] = numVal;
        this.saveData(data);
        DashboardRenderer.renderAll();
    },

    addTransaction(tx) {
        const data = this.getData();
        const newTx = {
            id: "tx_" + Date.now(),
            description: tx.description.trim(),
            amount: Number(tx.amount),
            type: tx.type, // 'income' or 'expense'
            category: tx.category || "Other",
            date: tx.date || new Date().toISOString().split("T")[0]
        };
        data.transactions.unshift(newTx);
        this.saveData(data);
        DashboardRenderer.renderAll();
    },

    deleteTransaction(id) {
        const data = this.getData();
        data.transactions = data.transactions.filter((t) => t.id !== id);
        this.saveData(data);
        DashboardRenderer.renderAll();
    },

    addGoal(goal) {
        const data = this.getData();
        const newGoal = {
            id: "goal_" + Date.now(),
            name: goal.name.trim(),
            targetAmount: Number(goal.targetAmount),
            currentAmount: Number(goal.currentAmount || 0),
            deadline: goal.deadline || ""
        };
        data.goals.push(newGoal);
        this.saveData(data);
        DashboardRenderer.renderAll();
    },

    updateGoalAmount(id, addedAmount) {
        const data = this.getData();
        const goal = data.goals.find((g) => g.id === id);
        if (goal) {
            goal.currentAmount = Math.max(0, goal.currentAmount + Number(addedAmount));
            this.saveData(data);
            DashboardRenderer.renderAll();
        }
    },

    deleteGoal(id) {
        const data = this.getData();
        data.goals = data.goals.filter((g) => g.id !== id);
        this.saveData(data);
        DashboardRenderer.renderAll();
    },

    resetAllData() {
        try {
            localStorage.removeItem(this.getStorageKey());
        } catch (e) {
            console.error("UserDataStore: Error clearing data:", e);
        }
        DashboardRenderer.renderAll();
    }
};

/* ==========================================================================
   2. CENTRALIZED AUTHENTICATION STORE (AuthManager)
   ========================================================================== */

const AuthManager = {
    isAuthenticated() {
        try {
            const isLoggedIn = localStorage.getItem("vortexLoggedIn") === "true";
            const user = this.getUser();
            return isLoggedIn && user !== null;
        } catch (e) {
            return false;
        }
    },

    getUsersDb() {
        try {
            const raw = localStorage.getItem("vortex_registered_users");
            return raw ? JSON.parse(raw) : {};
        } catch (e) {
            return {};
        }
    },

    saveUsersDb(db) {
        try {
            localStorage.setItem("vortex_registered_users", JSON.stringify(db));
        } catch (e) {}
    },

    getUser() {
        try {
            const stored = localStorage.getItem("vortexUser");
            if (stored) {
                return JSON.parse(stored);
            }
            if (localStorage.getItem("vortexLoggedIn") === "true") {
                return { name: "User", email: "user@vortex.app" };
            }
            return null;
        } catch (e) {
            return null;
        }
    },

    login(email, password) {
        const normEmail = email.toLowerCase().trim();
        const db = this.getUsersDb();
        const existing = db[normEmail];

        if (existing) {
            if (existing.password && existing.password !== password) {
                return {
                    success: false,
                    message: "Incorrect password. Please try again."
                };
            }
            localStorage.setItem("vortexUser", JSON.stringify(existing));
            localStorage.setItem("vortexLoggedIn", "true");
            return { success: true, user: existing };
        }

        // Fallback for single stored user
        const storedUser = this.getUser();
        if (storedUser && storedUser.email && storedUser.email.toLowerCase() === normEmail) {
            if (!storedUser.password || storedUser.password === password) {
                localStorage.setItem("vortexLoggedIn", "true");
                db[normEmail] = storedUser;
                this.saveUsersDb(db);
                return { success: true, user: storedUser };
            }
        }

        // Quick sign-in registration if valid format
        if (normEmail.includes("@") && password && password.length >= 6) {
            const name = normEmail.split("@")[0];
            const formattedName = name.charAt(0).toUpperCase() + name.slice(1);
            const newUser = { name: formattedName, email: normEmail, password: password };
            db[normEmail] = newUser;
            this.saveUsersDb(db);
            localStorage.setItem("vortexUser", JSON.stringify(newUser));
            localStorage.setItem("vortexLoggedIn", "true");
            return { success: true, user: newUser };
        }

        return {
            success: false,
            message: "No VORTEX account found with this email. Please sign up first."
        };
    },

    signup(name, email, password) {
        const normEmail = email.toLowerCase().trim();
        const db = this.getUsersDb();

        const newUser = {
            name: name.trim(),
            email: normEmail,
            password: password
        };
        db[normEmail] = newUser;
        this.saveUsersDb(db);
        localStorage.setItem("vortexUser", JSON.stringify(newUser));
        localStorage.setItem("vortexLoggedIn", "true");
        return { success: true, user: newUser };
    },

    logout() {
        try {
            localStorage.removeItem("vortexLoggedIn");
            sessionStorage.removeItem("redirectAfterAuth");
        } catch (e) {
            console.error("AuthManager: Error during logout:", e);
        }
        AppRouter.navigate("#/");
    }
};

/* ==========================================================================
   3. PROGRESSIVE FIRST-TIME FINANCIAL SETUP WIZARD
   ========================================================================== */

const SetupWizardController = {
    overlay: document.getElementById("setupWizardOverlay"),
    currentStep: 1,
    totalSteps: 6,

    init() {
        // Step 1 Next
        const step1Next = document.getElementById("setupStep1Next");
        if (step1Next) {
            step1Next.addEventListener("click", () => this.goToStep(2));
        }

        // Back / Next buttons across steps
        document.querySelectorAll(".btn-wizard-back").forEach((btn) => {
            btn.addEventListener("click", () => {
                const backStep = Number(btn.getAttribute("data-back"));
                this.goToStep(backStep);
            });
        });

        document.querySelectorAll(".btn-wizard-next").forEach((btn) => {
            btn.addEventListener("click", () => {
                const nextStep = Number(btn.getAttribute("data-next"));
                this.saveCurrentStepData(this.currentStep);
                this.goToStep(nextStep);
            });
        });

        // Real-time auto-saving on typing
        const bindAutoSave = (id, step) => {
            const el = document.getElementById(id);
            if (el) {
                el.addEventListener("input", () => this.saveCurrentStepData(step));
                el.addEventListener("change", () => this.saveCurrentStepData(step));
            }
        };

        bindAutoSave("setupBalanceInput", 2);
        bindAutoSave("setupIncomeInput", 3);
        bindAutoSave("setupExpensesInput", 4);
        bindAutoSave("setupSavingsInput", 5);

        // Finish Step 6
        const setupFinishBtn = document.getElementById("setupFinishBtn");
        if (setupFinishBtn) {
            setupFinishBtn.addEventListener("click", () => this.finishSetup());
        }
    },

    getResumeStep() {
        const data = UserDataStore.getData();
        const fin = data.financialProfile;
        if (fin.balance === null || fin.balance === "") return 2;
        if (fin.monthlyIncome === null || fin.monthlyIncome === "") return 3;
        if (fin.monthlyExpenses === null || fin.monthlyExpenses === "") return 4;
        if (fin.savings === null || fin.savings === "") return 5;
        return 6;
    },

    openWizard(isRestart = false) {
        if (!this.overlay) return;

        // Prepopulate existing data
        const data = UserDataStore.getData();
        const fin = data.financialProfile;

        const balanceInp = document.getElementById("setupBalanceInput");
        const incomeInp = document.getElementById("setupIncomeInput");
        const expensesInp = document.getElementById("setupExpensesInput");
        const savingsInp = document.getElementById("setupSavingsInput");

        if (balanceInp) balanceInp.value = fin.balance !== null && fin.balance !== undefined ? fin.balance : "";
        if (incomeInp) incomeInp.value = fin.monthlyIncome !== null && fin.monthlyIncome !== undefined ? fin.monthlyIncome : "";
        if (expensesInp) expensesInp.value = fin.monthlyExpenses !== null && fin.monthlyExpenses !== undefined ? fin.monthlyExpenses : "";
        if (savingsInp) savingsInp.value = fin.savings !== null && fin.savings !== undefined ? fin.savings : "";

        const resumeStep = this.getResumeStep();
        const startStep = isRestart ? 1 : (resumeStep === 2 && fin.balance === null ? 1 : resumeStep);

        this.goToStep(startStep);
        this.overlay.style.display = "flex";
        this.overlay.classList.add("active");
        document.body.style.overflow = "hidden";
    },

    closeWizard() {
        if (!this.overlay) return;
        this.overlay.style.display = "none";
        this.overlay.classList.remove("active");
        document.body.style.overflow = "";
    },

    saveCurrentStepData(stepNum) {
        const data = UserDataStore.getData();
        if (stepNum === 2) {
            const el = document.getElementById("setupBalanceInput");
            if (el) {
                const val = el.value.trim();
                data.financialProfile.balance = val !== "" && !isNaN(val) ? Number(val) : null;
            }
        } else if (stepNum === 3) {
            const el = document.getElementById("setupIncomeInput");
            if (el) {
                const val = el.value.trim();
                data.financialProfile.monthlyIncome = val !== "" && !isNaN(val) ? Number(val) : null;
            }
        } else if (stepNum === 4) {
            const el = document.getElementById("setupExpensesInput");
            if (el) {
                const val = el.value.trim();
                data.financialProfile.monthlyExpenses = val !== "" && !isNaN(val) ? Number(val) : null;
            }
        } else if (stepNum === 5) {
            const el = document.getElementById("setupSavingsInput");
            if (el) {
                const val = el.value.trim();
                data.financialProfile.savings = val !== "" && !isNaN(val) ? Number(val) : null;
            }
        }
        UserDataStore.saveData(data);
    },

    goToStep(stepNum) {
        this.currentStep = stepNum;

        // Update progress bar
        const indicator = document.getElementById("setupStepIndicator");
        const bar = document.getElementById("setupProgressBar");
        if (indicator) indicator.textContent = `Step ${stepNum} of ${this.totalSteps}`;
        if (bar) bar.style.width = `${(stepNum / this.totalSteps) * 100}%`;

        // Switch step views
        for (let i = 1; i <= this.totalSteps; i++) {
            const stepView = document.getElementById(`setupStep${i}`);
            if (stepView) {
                if (i === stepNum) {
                    stepView.classList.add("active");
                    const input = stepView.querySelector("input");
                    if (input) setTimeout(() => input.focus(), 150);
                } else {
                    stepView.classList.remove("active");
                }
            }
        }
    },

    finishSetup() {
        this.saveCurrentStepData(this.currentStep);

        const goalNameEl = document.getElementById("setupGoalName");
        const goalTargetEl = document.getElementById("setupGoalTarget");
        const goalCurrentEl = document.getElementById("setupGoalCurrent");

        const goalName = goalNameEl ? goalNameEl.value.trim() : "";
        const goalTarget = goalTargetEl ? goalTargetEl.value.trim() : "";
        const goalCurrent = goalCurrentEl ? goalCurrentEl.value.trim() : "";

        const data = UserDataStore.getData();

        if (goalName && goalTarget && !isNaN(goalTarget)) {
            data.goals.push({
                id: "goal_" + Date.now(),
                name: goalName,
                targetAmount: Number(goalTarget),
                currentAmount: goalCurrent && !isNaN(goalCurrent) ? Number(goalCurrent) : 0,
                deadline: ""
            });
        }

        data.setupCompleted = true;
        data.financialProfileCompleted = true;
        UserDataStore.saveData(data);

        this.closeWizard();
        AppRouter.navigate("#/dashboard");
        DashboardRenderer.renderAll();
    }
};

/* ==========================================================================
   4. EDIT METRIC MODAL / SHEET CONTROLLER
   ========================================================================== */

const EditMetricModal = {
    overlay: document.getElementById("editMetricOverlay"),
    form: document.getElementById("editMetricForm"),
    closeBtn: document.getElementById("editMetricClose"),
    cancelBtn: document.getElementById("editMetricCancel"),
    keyInput: document.getElementById("editMetricKey"),
    valInput: document.getElementById("editMetricValue"),
    titleEl: document.getElementById("editMetricTitle"),
    labelEl: document.getElementById("editMetricLabel"),

    init() {
        if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
        if (this.cancelBtn) this.cancelBtn.addEventListener("click", () => this.close());
        if (this.overlay) {
            this.overlay.addEventListener("click", (e) => {
                if (e.target === this.overlay) this.close();
            });
        }

        if (this.form) {
            this.form.addEventListener("submit", (e) => {
                e.preventDefault();
                const key = this.keyInput.value;
                const val = this.valInput.value;
                UserDataStore.updateFinancialMetric(key, val);
                this.close();
            });
        }

        // Delegate edit buttons on cards
        document.addEventListener("click", (e) => {
            const btn = e.target.closest(".btn-edit-metric");
            if (btn) {
                const metricKey = btn.getAttribute("data-metric");
                this.open(metricKey);
            }
        });
    },

    open(metricKey) {
        if (!this.overlay) return;
        const data = UserDataStore.getData();
        const currentValue = data.financialProfile[metricKey];

        const titles = {
            balance: "Edit Total Balance",
            monthlyIncome: "Edit Monthly Income",
            monthlyExpenses: "Edit Monthly Expenses",
            savings: "Edit Savings & Surplus"
        };

        const labels = {
            balance: "Current Liquid Balance (₹)",
            monthlyIncome: "Monthly Income (₹)",
            monthlyExpenses: "Monthly Expenses (₹)",
            savings: "Total Savings Amount (₹)"
        };

        this.keyInput.value = metricKey;
        this.valInput.value = currentValue !== null ? currentValue : "";
        this.titleEl.textContent = titles[metricKey] || "Edit Metric";
        this.labelEl.textContent = labels[metricKey] || "Amount (₹)";

        this.overlay.style.display = "flex";
        this.overlay.classList.add("active");
        this.valInput.focus();
    },

    close() {
        if (!this.overlay) return;
        this.overlay.style.display = "none";
        this.overlay.classList.remove("active");
    }
};

/* ==========================================================================
   5. REAL-DATA DASHBOARD RENDERER & CALCULATORS
   ========================================================================== */

const DashboardRenderer = {
    formatCurrency(amount) {
        if (amount === null || amount === undefined || isNaN(amount)) return null;
        return "₹" + Number(amount).toLocaleString("en-IN");
    },

    renderAll() {
        const data = UserDataStore.getData();
        const user = AuthManager.getUser() || { name: "User", email: "user@vortex.app" };

        this.updateProfileUI(user);
        this.renderFinancialSummaryCards(data.financialProfile);
        this.renderHealthScore(data);
        this.renderSpendingChart(data);
        this.renderCategoriesBreakdown(data.transactions);
        this.renderTransactionsList(data.transactions);
        this.renderGoals(data.goals);
        this.renderInsights(data);
        this.renderSubViews(data);
    },

    updateProfileUI(user) {
        const initial = (user.name || "U").charAt(0).toUpperCase();
        const setTxt = (id, txt) => {
            const el = document.getElementById(id);
            if (el) el.textContent = txt;
        };

        setTxt("sidebarUserName", user.name);
        setTxt("sidebarUserAvatar", initial);
        setTxt("topbarUserName", user.name);
        setTxt("topbarUserAvatar", initial);
        setTxt("dropdownUserName", user.name);
        setTxt("dropdownUserEmail", user.email || "user@vortex.app");

        const settingsName = document.getElementById("settingsNameInput");
        const settingsEmail = document.getElementById("settingsEmailInput");
        if (settingsName) settingsName.value = user.name;
        if (settingsEmail) settingsEmail.value = user.email || "user@vortex.app";
    },

    renderFinancialSummaryCards(fin) {
        const balanceWrap = document.getElementById("displayBalanceWrap");
        const incomeWrap = document.getElementById("displayIncomeWrap");
        const expensesWrap = document.getElementById("displayExpensesWrap");
        const savingsWrap = document.getElementById("displaySavingsWrap");

        // 1. Total Balance
        if (balanceWrap) {
            if (fin.balance !== null) {
                balanceWrap.innerHTML = `<h2 class="metric-amount">${this.formatCurrency(fin.balance)}</h2>`;
            } else {
                balanceWrap.innerHTML = `
                    <div class="empty-metric-state">
                        <span class="empty-metric-text">No balance added yet.</span>
                        <button type="button" class="btn-empty-action btn-edit-metric" data-metric="balance">+ Add balance</button>
                    </div>`;
            }
        }

        // 2. Monthly Income
        if (incomeWrap) {
            if (fin.monthlyIncome !== null) {
                incomeWrap.innerHTML = `<h3 class="metric-amount">${this.formatCurrency(fin.monthlyIncome)}</h3>`;
            } else {
                incomeWrap.innerHTML = `
                    <div class="empty-metric-state">
                        <span class="empty-metric-text">No income recorded.</span>
                        <button type="button" class="btn-empty-action btn-edit-metric" data-metric="monthlyIncome">+ Add income</button>
                    </div>`;
            }
        }

        // 3. Monthly Expenses
        if (expensesWrap) {
            if (fin.monthlyExpenses !== null) {
                expensesWrap.innerHTML = `<h3 class="metric-amount">${this.formatCurrency(fin.monthlyExpenses)}</h3>`;
            } else {
                expensesWrap.innerHTML = `
                    <div class="empty-metric-state">
                        <span class="empty-metric-text">No spending cap set.</span>
                        <button type="button" class="btn-empty-action btn-edit-metric" data-metric="monthlyExpenses">+ Add expense</button>
                    </div>`;
            }
        }

        // 4. Savings / Surplus
        if (savingsWrap) {
            if (fin.savings !== null) {
                let pillHtml = "";
                if (fin.monthlyIncome && fin.monthlyExpenses) {
                    const surplus = fin.monthlyIncome - fin.monthlyExpenses;
                    const savingsRate = Math.round((surplus / fin.monthlyIncome) * 100);
                    pillHtml = `<div class="metric-calc-pill">${savingsRate}% savings rate (${this.formatCurrency(surplus)}/mo)</div>`;
                }
                savingsWrap.innerHTML = `
                    <h3 class="metric-amount">${this.formatCurrency(fin.savings)}</h3>
                    ${pillHtml}`;
            } else if (fin.monthlyIncome !== null && fin.monthlyExpenses !== null) {
                const calculatedSurplus = fin.monthlyIncome - fin.monthlyExpenses;
                const savingsRate = Math.round((calculatedSurplus / fin.monthlyIncome) * 100);
                savingsWrap.innerHTML = `
                    <h3 class="metric-amount">${this.formatCurrency(calculatedSurplus)}</h3>
                    <div class="metric-calc-pill">${savingsRate}% monthly surplus</div>`;
            } else {
                savingsWrap.innerHTML = `
                    <div class="empty-metric-state">
                        <span class="empty-metric-text">Add current savings.</span>
                        <button type="button" class="btn-empty-action btn-edit-metric" data-metric="savings">+ Add savings</button>
                    </div>`;
            }
        }
    },

    renderHealthScore(data) {
        const panel = document.getElementById("healthScorePanel");
        if (!panel) return;

        const fin = data.financialProfile;
        const hasCoreData = fin.monthlyIncome && fin.monthlyExpenses;

        if (!hasCoreData) {
            panel.innerHTML = `
                <div class="panel-header-row">
                    <div>
                        <h3 class="panel-title">Financial Health</h3>
                        <p class="panel-sub">Algorithmic stability index</p>
                    </div>
                </div>
                <div class="empty-panel-state">
                    <p>Add your monthly income and expenses to calculate your Financial Health score.</p>
                    <button type="button" class="btn-empty-action" id="healthSetupBtn">Complete financial profile</button>
                </div>`;
            const btn = document.getElementById("healthSetupBtn");
            if (btn) btn.addEventListener("click", () => SetupWizardController.openWizard());
            return;
        }

        const income = fin.monthlyIncome;
        const expenses = fin.monthlyExpenses;
        const savings = fin.savings || (income - expenses);

        // 1. Savings Rate Score (0 to 30)
        const savingsRate = Math.max(0, (income - expenses) / income);
        const savingsScore = Math.min(30, Math.round((savingsRate / 0.25) * 30));

        // 2. Emergency Fund Runway Score (0 to 30)
        const runwayMonths = expenses > 0 ? savings / expenses : 0;
        const runwayScore = Math.min(30, Math.round((runwayMonths / 6) * 30));

        // 3. Expense Ratio Score (0 to 20)
        const expenseRatio = expenses / income;
        const expenseScore = expenseRatio <= 0.5 ? 20 : Math.max(0, Math.round((1 - (expenseRatio - 0.5) / 0.5) * 20));

        // 4. Goals Score (0 to 20)
        let goalsScore = 15;
        if (data.goals.length > 0) {
            const avgProgress = data.goals.reduce((acc, g) => acc + (g.currentAmount / g.targetAmount), 0) / data.goals.length;
            goalsScore = Math.min(20, Math.round(avgProgress * 20));
        }

        const totalScore = Math.min(100, savingsScore + runwayScore + expenseScore + goalsScore);
        const offset = Math.round(427 - (totalScore / 100) * 427);

        panel.innerHTML = `
            <div class="panel-header-row">
                <div>
                    <h3 class="panel-title">Financial Health</h3>
                    <p class="panel-sub">Calculated from your verified figures</p>
                </div>
                <span class="health-status-badge" style="color: ${totalScore >= 70 ? 'var(--accent-green)' : 'var(--accent-orange)'}">${totalScore >= 70 ? 'OPTIMAL' : 'DEVELOPING'}</span>
            </div>

            <div class="radial-gauge-wrapper">
                <div class="gauge-center-content">
                    <span class="gauge-score-number">${totalScore}</span>
                    <span class="gauge-score-max">/ 100</span>
                </div>
                <svg class="radial-gauge-svg" viewBox="0 0 160 160">
                    <circle class="gauge-track" cx="80" cy="80" r="68"></circle>
                    <circle class="gauge-fill" cx="80" cy="80" r="68" style="stroke-dashoffset: ${offset};"></circle>
                </svg>
            </div>

            <div class="health-breakdown-list">
                <div class="health-sub-item">
                    <div class="sub-label-row">
                        <span>Savings Rate (${Math.round(savingsRate * 100)}%)</span>
                        <span>${savingsScore}/30 pts</span>
                    </div>
                    <div class="sub-progress-track">
                        <div class="sub-progress-bar" style="width: ${(savingsScore / 30) * 100}%;"></div>
                    </div>
                </div>
                <div class="health-sub-item">
                    <div class="sub-label-row">
                        <span>Emergency Runway (${runwayMonths.toFixed(1)} mo)</span>
                        <span>${runwayScore}/30 pts</span>
                    </div>
                    <div class="sub-progress-track">
                        <div class="sub-progress-bar" style="width: ${(runwayScore / 30) * 100}%;"></div>
                    </div>
                </div>
                <div class="health-sub-item">
                    <div class="sub-label-row">
                        <span>Expense Ratio (${Math.round(expenseRatio * 100)}%)</span>
                        <span>${expenseScore}/20 pts</span>
                    </div>
                    <div class="sub-progress-track">
                        <div class="sub-progress-bar" style="width: ${(expenseScore / 20) * 100}%;"></div>
                    </div>
                </div>
            </div>`;
    },

    renderSpendingChart(data) {
        const container = document.getElementById("spendingChartContainer");
        if (!container) return;

        const transactions = data.transactions.filter((t) => t.type === "expense");

        if (transactions.length === 0) {
            container.innerHTML = `
                <div class="empty-panel-state">
                    <p>No spending data yet. Add your first transaction to view trends.</p>
                    <button type="button" class="btn-empty-action" id="chartAddTxBtn">+ Add transaction</button>
                </div>`;
            const btn = document.getElementById("chartAddTxBtn");
            if (btn) btn.addEventListener("click", () => TransactionModal.open());
            return;
        }

        const amounts = transactions.map((t) => t.amount);
        const maxVal = Math.max(...amounts, 1000);
        const width = 600;
        const height = 200;
        const pts = amounts.map((amt, idx) => {
            const x = (idx / Math.max(1, amounts.length - 1)) * (width - 40) + 20;
            const y = height - (amt / maxVal) * (height - 60) - 20;
            return { x, y };
        });

        let pathStr = `M ${pts[0].x} ${pts[0].y}`;
        for (let i = 1; i < pts.length; i++) {
            pathStr += ` L ${pts[i].x} ${pts[i].y}`;
        }

        container.innerHTML = `
            <svg class="spending-svg-chart" viewBox="0 0 ${width} ${height}">
                <path d="${pathStr}" fill="none" stroke="var(--accent-purple)" stroke-width="2.5" stroke-linecap="round"></path>
                ${pts.map((p) => `<circle cx="${p.x}" cy="${p.y}" r="4" fill="white"></circle>`).join("")}
            </svg>`;
    },

    renderCategoriesBreakdown(transactions) {
        const list = document.getElementById("spendingCategoriesList");
        if (!list) return;

        const expenses = transactions.filter((t) => t.type === "expense");
        if (expenses.length === 0) {
            list.innerHTML = `
                <div class="empty-panel-state" style="padding: 1.5rem 0;">
                    <p>No categorized expenses yet.</p>
                </div>`;
            return;
        }

        const totalsByCategory = {};
        let totalOutflow = 0;

        expenses.forEach((tx) => {
            totalsByCategory[tx.category] = (totalsByCategory[tx.category] || 0) + tx.amount;
            totalOutflow += tx.amount;
        });

        const categories = Object.keys(totalsByCategory).sort((a, b) => totalsByCategory[b] - totalsByCategory[a]);

        list.innerHTML = categories
            .map((cat) => {
                const amt = totalsByCategory[cat];
                const pct = Math.round((amt / totalOutflow) * 100);
                return `
                <div class="category-item">
                    <div class="cat-left">
                        <span class="cat-indicator"></span>
                        <span class="cat-name">${cat}</span>
                    </div>
                    <div class="cat-bar-wrap">
                        <div class="cat-progress-fill" style="width: ${pct}%;"></div>
                    </div>
                    <div class="cat-values">
                        <span class="cat-amount">₹${amt.toLocaleString("en-IN")}</span>
                        <span class="cat-pct">${pct}%</span>
                    </div>
                </div>`;
            })
            .join("");
    },

    renderTransactionsList(transactions) {
        const wrap = document.getElementById("transactionsListWrap");
        if (!wrap) return;

        if (!transactions || transactions.length === 0) {
            wrap.innerHTML = `
                <div class="empty-panel-state">
                    <p>Your transactions will appear here.</p>
                    <button type="button" class="btn-empty-action" id="txEmptyAddBtn">+ Add transaction</button>
                </div>`;
            const btn = document.getElementById("txEmptyAddBtn");
            if (btn) btn.addEventListener("click", () => TransactionModal.open());
            return;
        }

        wrap.innerHTML = `
            <table class="transactions-table">
                <thead>
                    <tr>
                        <th>Description</th>
                        <th>Category</th>
                        <th>Date</th>
                        <th class="text-right">Amount</th>
                        <th class="text-right">Action</th>
                    </tr>
                </thead>
                <tbody>
                    ${transactions
                        .slice(0, 8)
                        .map((tx) => {
                            const isIncome = tx.type === "income";
                            return `
                            <tr>
                                <td>
                                    <div class="tx-merchant">
                                        <div class="tx-icon ${isIncome ? 'income' : ''}">${tx.description.charAt(0).toUpperCase()}</div>
                                        <span class="tx-title">${tx.description}</span>
                                    </div>
                                </td>
                                <td><span class="badge-tag ${isIncome ? 'positive' : ''}">${tx.category}</span></td>
                                <td class="tx-date">${tx.date}</td>
                                <td class="tx-amount ${isIncome ? 'positive' : 'negative'} text-right">
                                    ${isIncome ? '+' : '-'}₹${tx.amount.toLocaleString("en-IN")}
                                </td>
                                <td class="text-right">
                                    <button type="button" class="btn-tx-del" data-id="${tx.id}">Delete</button>
                                </td>
                            </tr>`;
                        })
                        .join("")}
                </tbody>
            </table>`;

        wrap.querySelectorAll(".btn-tx-del").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                UserDataStore.deleteTransaction(id);
            });
        });
    },

    renderGoals(goals) {
        const list = document.getElementById("goalsListContainer");
        if (!list) return;

        if (!goals || goals.length === 0) {
            list.innerHTML = `
                <div class="empty-panel-state" style="grid-column: 1 / -1;">
                    <p>You haven't created any goals yet.</p>
                    <button type="button" class="btn-empty-action" id="emptyCreateGoalBtn">+ Create goal</button>
                </div>`;
            const btn = document.getElementById("emptyCreateGoalBtn");
            if (btn) btn.addEventListener("click", () => GoalModal.open());
            return;
        }

        list.innerHTML = goals
            .map((g) => {
                const pct = Math.min(100, Math.round((g.currentAmount / g.targetAmount) * 100));
                return `
                <div class="goal-item">
                    <div class="goal-info-row">
                        <span class="goal-name">${g.name}</span>
                        <span class="goal-progress-num">₹${g.currentAmount.toLocaleString("en-IN")} / ₹${g.targetAmount.toLocaleString("en-IN")}</span>
                    </div>
                    <div class="goal-progress-bar">
                        <div class="goal-fill" style="width: ${pct}%;"></div>
                    </div>
                    <div class="goal-meta-row">
                        <span>${pct}% saved</span>
                        <div class="goal-card-actions">
                            <button type="button" class="btn-goal-act add-funds-btn" data-id="${g.id}">+ Add</button>
                            <button type="button" class="btn-goal-act del-goal-btn" data-id="${g.id}">Delete</button>
                        </div>
                    </div>
                </div>`;
            })
            .join("");

        list.querySelectorAll(".add-funds-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                const amt = prompt("Enter amount to add to this goal (₹):");
                if (amt && !isNaN(amt) && Number(amt) > 0) {
                    UserDataStore.updateGoalAmount(id, Number(amt));
                }
            });
        });

        list.querySelectorAll(".del-goal-btn").forEach((btn) => {
            btn.addEventListener("click", () => {
                const id = btn.getAttribute("data-id");
                UserDataStore.deleteGoal(id);
            });
        });
    },

    renderInsights(data) {
        const grid = document.getElementById("aiInsightsGrid");
        if (!grid) return;

        const fin = data.financialProfile;
        const insights = [];

        if (fin.monthlyIncome && fin.monthlyExpenses) {
            const surplus = fin.monthlyIncome - fin.monthlyExpenses;
            const savingsRate = Math.round((surplus / fin.monthlyIncome) * 100);

            if (savingsRate >= 20) {
                insights.push({
                    title: "Healthy Savings Rate",
                    desc: `You are saving ${savingsRate}% of your monthly income (${this.formatCurrency(surplus)}/mo).`
                });
            } else if (savingsRate > 0) {
                insights.push({
                    title: "Opportunity to Optimize",
                    desc: `Your current savings rate is ${savingsRate}%. Increasing savings to 20% would add ₹${Math.round(fin.monthlyIncome * 0.2 - surplus).toLocaleString('en-IN')}/mo.`
                });
            } else {
                insights.push({
                    title: "Spending Exceeds Income",
                    desc: `Your declared monthly expenses exceed your income by ₹${Math.abs(surplus).toLocaleString('en-IN')}. Review spending envelopes.`
                });
            }
        }

        if (fin.savings && fin.monthlyExpenses) {
            const runway = (fin.savings / fin.monthlyExpenses).toFixed(1);
            insights.push({
                title: "Emergency Runway",
                desc: `Your savings of ${this.formatCurrency(fin.savings)} cover ${runway} months of living expenses.`
            });
        }

        if (data.goals.length > 0) {
            const topGoal = data.goals[0];
            const pct = Math.round((topGoal.currentAmount / topGoal.targetAmount) * 100);
            insights.push({
                title: `Goal: ${topGoal.name}`,
                desc: `You have achieved ${pct}% of your ${this.formatCurrency(topGoal.targetAmount)} target.`
            });
        }

        if (insights.length === 0) {
            grid.innerHTML = `
                <div class="empty-panel-state" style="grid-column: 1 / -1;">
                    <p>Add your income, expenses, and transactions to unlock personalized insights.</p>
                </div>`;
            return;
        }

        grid.innerHTML = insights
            .slice(0, 3)
            .map(
                (item) => `
            <div class="ai-insight-card">
                <h4>${item.title}</h4>
                <p>${item.desc}</p>
            </div>`
            )
            .join("");
    },

    renderSubViews(data) {
        const financesGrid = document.getElementById("financesSubViewGrid");
        if (financesGrid) {
            const fin = data.financialProfile;
            financesGrid.innerHTML = `
                <div class="liquid-metric-card">
                    <span class="metric-label">TOTAL BALANCE</span>
                    <h3 class="metric-amount">${this.formatCurrency(fin.balance) || 'Not set'}</h3>
                    <button type="button" class="btn-edit-metric" data-metric="balance">Edit</button>
                </div>
                <div class="liquid-metric-card">
                    <span class="metric-label">MONTHLY INCOME</span>
                    <h3 class="metric-amount">${this.formatCurrency(fin.monthlyIncome) || 'Not set'}</h3>
                    <button type="button" class="btn-edit-metric" data-metric="monthlyIncome">Edit</button>
                </div>
                <div class="liquid-metric-card">
                    <span class="metric-label">SAVINGS</span>
                    <h3 class="metric-amount">${this.formatCurrency(fin.savings) || 'Not set'}</h3>
                    <button type="button" class="btn-edit-metric" data-metric="savings">Edit</button>
                </div>`;
        }

        const budgetPanel = document.getElementById("budgetSubViewPanel");
        if (budgetPanel) {
            const fin = data.financialProfile;
            if (fin.monthlyIncome && fin.monthlyExpenses) {
                const spentRatio = Math.min(100, Math.round((fin.monthlyExpenses / fin.monthlyIncome) * 100));
                budgetPanel.innerHTML = `
                    <h3 class="panel-title">Monthly Allocation</h3>
                    <p class="panel-sub" style="margin-bottom: 1.2rem;">Income: ${this.formatCurrency(fin.monthlyIncome)} | Expenses: ${this.formatCurrency(fin.monthlyExpenses)}</p>
                    <div class="goal-progress-bar" style="height: 10px; margin-bottom: 1rem;">
                        <div class="goal-fill" style="width: ${spentRatio}%;"></div>
                    </div>
                    <p style="font-size:0.85rem; color:var(--text-secondary);">${spentRatio}% of income allocated to expenses.</p>`;
            } else {
                budgetPanel.innerHTML = `<p style="color:var(--text-muted);">Set your monthly income and expenses to view budget allocation.</p>`;
            }
        }

        const runwayOutput = document.getElementById("runwayCalculatorOutput");
        if (runwayOutput) {
            const fin = data.financialProfile;
            if (fin.savings && fin.monthlyExpenses) {
                const months = (fin.savings / fin.monthlyExpenses).toFixed(1);
                runwayOutput.innerHTML = `
                    <p style="font-size:1.1rem; color:white;">Your emergency runway is <strong>${months} months</strong>.</p>
                    <p style="font-size:0.85rem; color:var(--text-muted); margin-top:0.3rem;">Based on ${this.formatCurrency(fin.savings)} savings and ${this.formatCurrency(fin.monthlyExpenses)} monthly living costs.</p>`;
            } else {
                runwayOutput.innerHTML = `<p style="color:var(--text-muted);">Enter both your current savings and monthly expenses to calculate emergency runway.</p>`;
            }
        }
    }
};

/* ==========================================================================
   6. TRANSACTION & GOAL MODALS
   ========================================================================== */

const TransactionModal = {
    overlay: document.getElementById("transactionModalOverlay"),
    form: document.getElementById("transactionForm"),
    closeBtn: document.getElementById("transactionModalClose"),

    init() {
        if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
        if (this.overlay) {
            this.overlay.addEventListener("click", (e) => {
                if (e.target === this.overlay) this.close();
            });
        }

        const openBtn = document.getElementById("openAddTransactionBtn");
        const addTxBtnMain = document.getElementById("addTxBtnMain");
        if (openBtn) openBtn.addEventListener("click", () => this.open());
        if (addTxBtnMain) addTxBtnMain.addEventListener("click", () => this.open());

        if (this.form) {
            this.form.addEventListener("submit", (e) => {
                e.preventDefault();
                const desc = document.getElementById("txDesc").value;
                const amt = document.getElementById("txAmount").value;
                const type = document.getElementById("txType").value;
                const category = document.getElementById("txCategory").value;
                const date = document.getElementById("txDate").value;

                UserDataStore.addTransaction({
                    description: desc,
                    amount: amt,
                    type: type,
                    category: category,
                    date: date
                });

                this.form.reset();
                this.close();
            });
        }
    },

    open() {
        if (!this.overlay) return;
        const dateInput = document.getElementById("txDate");
        if (dateInput && !dateInput.value) {
            dateInput.value = new Date().toISOString().split("T")[0];
        }
        this.overlay.style.display = "flex";
        this.overlay.classList.add("active");
    },

    close() {
        if (!this.overlay) return;
        this.overlay.style.display = "none";
        this.overlay.classList.remove("active");
    }
};

const GoalModal = {
    overlay: document.getElementById("goalModalOverlay"),
    form: document.getElementById("goalForm"),
    closeBtn: document.getElementById("goalModalClose"),

    init() {
        if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.close());
        if (this.overlay) {
            this.overlay.addEventListener("click", (e) => {
                if (e.target === this.overlay) this.close();
            });
        }

        const openBtn = document.getElementById("addNewGoalBtn");
        if (openBtn) openBtn.addEventListener("click", () => this.open());

        if (this.form) {
            this.form.addEventListener("submit", (e) => {
                e.preventDefault();
                const name = document.getElementById("goalNameInput").value;
                const target = document.getElementById("goalTargetInput").value;
                const current = document.getElementById("goalCurrentInput").value;
                const deadline = document.getElementById("goalDeadlineInput").value;

                UserDataStore.addGoal({
                    name: name,
                    targetAmount: target,
                    currentAmount: current,
                    deadline: deadline
                });

                this.form.reset();
                this.close();
            });
        }
    },

    open() {
        if (!this.overlay) return;
        this.overlay.style.display = "flex";
        this.overlay.classList.add("active");
    },

    close() {
        if (!this.overlay) return;
        this.overlay.style.display = "none";
        this.overlay.classList.remove("active");
    }
};

/* ==========================================================================
   7. REUSABLE PROTECTED ROUTE GUARD & SPA ROUTER
   ========================================================================== */

const AppRouter = {
    currentRoute: "",

    protectedRoutes: [
        "#/financial-setup",
        "#/dashboard",
        "#/dashboard/finances",
        "#/dashboard/budget",
        "#/dashboard/expenses",
        "#/dashboard/health",
        "#/dashboard/learn",
        "#/dashboard/goals",
        "#/dashboard/research",
        "#/dashboard/settings"
    ],

    init() {
        window.addEventListener("hashchange", () => this.handleRouteChange());
        window.addEventListener("load", () => this.handleRouteChange());

        document.addEventListener("click", (e) => {
            const link = e.target.closest("a[href^='#']");
            if (link) {
                const targetHash = link.getAttribute("href");
                if (targetHash.startsWith("#/")) {
                    e.preventDefault();
                    this.navigate(targetHash);
                }
            }
        });
    },

    navigate(hash) {
        if (window.location.hash !== hash) {
            window.location.hash = hash;
        } else {
            this.handleRouteChange();
        }
    },

    handleRouteChange() {
        let rawHash = window.location.hash || "#/";
        if (!rawHash.startsWith("#/")) {
            rawHash = "#/" + rawHash.replace(/^#/, "");
        }

        this.currentRoute = rawHash;

        const isProtected = this.protectedRoutes.some(
            (route) => rawHash === route || rawHash.startsWith(route + "/")
        );

        if (isProtected) {
            if (!AuthManager.isAuthenticated()) {
                sessionStorage.setItem("redirectAfterAuth", rawHash);
                this.navigate("#/login");
                return;
            }

            // Check if profile setup is complete
            const isSetupComplete = UserDataStore.hasCompletedSetup();

            if (rawHash === "#/financial-setup") {
                if (isSetupComplete) {
                    this.navigate("#/dashboard");
                    return;
                }
                this.renderDashboard("#/dashboard");
                SetupWizardController.openWizard();
                return;
            }

            if (!isSetupComplete) {
                this.navigate("#/financial-setup");
                return;
            }

            // Render Dashboard directly without wizard
            SetupWizardController.closeWizard();
            this.renderDashboard(rawHash);
        } else {
            if (rawHash === "#/login") {
                if (AuthManager.isAuthenticated()) {
                    if (UserDataStore.hasCompletedSetup()) {
                        this.navigate("#/dashboard");
                    } else {
                        this.navigate("#/financial-setup");
                    }
                    return;
                }
                this.renderPublic();
                AuthUI.openLoginModal();
            } else if (rawHash === "#/signup") {
                if (AuthManager.isAuthenticated()) {
                    if (UserDataStore.hasCompletedSetup()) {
                        this.navigate("#/dashboard");
                    } else {
                        this.navigate("#/financial-setup");
                    }
                    return;
                }
                this.renderPublic();
                AuthUI.openSignupModal();
            } else {
                AuthUI.closeAuthModal();
                this.renderPublic();
            }
        }
    },

    renderPublic() {
        const publicContainer = document.getElementById("publicContainer");
        const dashboardApp = document.getElementById("dashboardApp");

        if (publicContainer) publicContainer.style.display = "block";
        if (dashboardApp) dashboardApp.style.display = "none";
        document.body.style.overflow = "";

        document.querySelectorAll("#publicNav .nav-item").forEach((item) => {
            const href = item.getAttribute("href");
            if (href === this.currentRoute) item.classList.add("active");
            else item.classList.remove("active");
        });
    },

    renderDashboard(route) {
        const publicContainer = document.getElementById("publicContainer");
        const dashboardApp = document.getElementById("dashboardApp");

        if (publicContainer) publicContainer.style.display = "none";
        if (dashboardApp) dashboardApp.style.display = "flex";
        AuthUI.closeAuthModal();

        DashboardRenderer.renderAll();

        let subview = "overview";
        if (route.includes("/finances")) subview = "finances";
        else if (route.includes("/budget")) subview = "budget";
        else if (route.includes("/expenses")) subview = "expenses";
        else if (route.includes("/health")) subview = "health";
        else if (route.includes("/learn")) subview = "learn";
        else if (route.includes("/goals")) subview = "goals";
        else if (route.includes("/research")) subview = "research";
        else if (route.includes("/settings")) subview = "settings";

        DashboardController.switchView(subview);
    }
};

/* ==========================================================================
   8. AUTHENTICATION UI & MODAL
   ========================================================================== */

const AuthUI = {
    overlay: document.getElementById("authOverlay"),
    closeBtn: document.getElementById("authClose"),
    loginForm: document.getElementById("loginForm"),
    signupForm: document.getElementById("signupForm"),
    loginFormElement: document.getElementById("loginFormElement"),
    signupFormElement: document.getElementById("signupFormElement"),
    showSignup: document.getElementById("showSignup"),
    showLogin: document.getElementById("showLogin"),

    init() {
        const loginBtn = document.getElementById("loginBtn");
        const signupBtn = document.getElementById("signupBtn");

        if (loginBtn) loginBtn.addEventListener("click", () => AppRouter.navigate("#/login"));
        if (signupBtn) signupBtn.addEventListener("click", () => AppRouter.navigate("#/signup"));

        if (this.showSignup) this.showSignup.addEventListener("click", () => this.switchToSignup());
        if (this.showLogin) this.showLogin.addEventListener("click", () => this.switchToLogin());

        if (this.closeBtn) this.closeBtn.addEventListener("click", () => this.handleModalClose());
        if (this.overlay) {
            this.overlay.addEventListener("click", (e) => {
                if (e.target === this.overlay) this.handleModalClose();
            });
        }

        if (this.loginFormElement) {
            this.loginFormElement.addEventListener("submit", (e) => {
                e.preventDefault();
                const email = document.getElementById("loginEmail").value.trim();
                const password = document.getElementById("loginPassword").value;

                const result = AuthManager.login(email, password);
                if (result.success) {
                    this.closeAuthModal();
                    if (UserDataStore.hasCompletedSetup()) {
                        const redirect = sessionStorage.getItem("redirectAfterAuth") || "#/dashboard";
                        sessionStorage.removeItem("redirectAfterAuth");
                        AppRouter.navigate(redirect);
                    } else {
                        AppRouter.navigate("#/financial-setup");
                    }
                } else {
                    alert(result.message);
                }
            });
        }

        if (this.signupFormElement) {
            this.signupFormElement.addEventListener("submit", (e) => {
                e.preventDefault();
                const name = document.getElementById("signupName").value.trim();
                const email = document.getElementById("signupEmail").value.trim();
                const password = document.getElementById("signupPassword").value;
                const confirmPassword = document.getElementById("signupConfirmPassword").value;

                if (!name || !email || !password || !confirmPassword) {
                    alert("All fields are required.");
                    return;
                }

                if (password.length < 6) {
                    alert("Password must contain at least 6 characters.");
                    return;
                }

                if (password !== confirmPassword) {
                    alert("Passwords do not match.");
                    return;
                }

                const result = AuthManager.signup(name, email, password);
                if (result.success) {
                    this.signupFormElement.reset();
                    this.closeAuthModal();
                    AppRouter.navigate("#/financial-setup");
                } else {
                    alert(result.message);
                }
            });
        }
    },

    openLoginModal() {
        if (!this.overlay) return;
        this.overlay.classList.add("active");
        if (this.loginForm) this.loginForm.style.display = "block";
        if (this.signupForm) this.signupForm.style.display = "none";
        document.body.style.overflow = "hidden";
    },

    openSignupModal() {
        if (!this.overlay) return;
        this.overlay.classList.add("active");
        if (this.loginForm) this.loginForm.style.display = "none";
        if (this.signupForm) this.signupForm.style.display = "block";
        document.body.style.overflow = "hidden";
    },

    switchToLogin() {
        if (this.signupForm) this.signupForm.style.display = "none";
        if (this.loginForm) this.loginForm.style.display = "block";
    },

    switchToSignup() {
        if (this.loginForm) this.loginForm.style.display = "none";
        if (this.signupForm) this.signupForm.style.display = "block";
    },

    closeAuthModal() {
        if (!this.overlay) return;
        this.overlay.classList.remove("active");
        document.body.style.overflow = "";
    },

    handleModalClose() {
        this.closeAuthModal();
        if (window.location.hash === "#/login" || window.location.hash === "#/signup") {
            AppRouter.navigate("#/");
        }
    }
};

/* ==========================================================================
   9. DASHBOARD CONTROLLER
   ========================================================================== */

const DashboardController = {
    init() {
        // Sidebar link clicks
        document.querySelectorAll(".sidebar-link").forEach((link) => {
            link.addEventListener("click", () => {
                const routeName = link.getAttribute("data-route");
                if (routeName) {
                    AppRouter.navigate(`#/dashboard/${routeName === "overview" ? "" : routeName}`.replace(/\/$/, ""));
                }
            });
        });

        // Profile Dropdown
        const topbarProfileBtn = document.getElementById("topbarProfileBtn");
        const profileDropdownMenu = document.getElementById("profileDropdownMenu");

        if (topbarProfileBtn && profileDropdownMenu) {
            topbarProfileBtn.addEventListener("click", (e) => {
                e.stopPropagation();
                profileDropdownMenu.classList.toggle("active");
            });

            document.addEventListener("click", (e) => {
                if (!profileDropdownMenu.contains(e.target) && !topbarProfileBtn.contains(e.target)) {
                    profileDropdownMenu.classList.remove("active");
                }
            });
        }

        // Logout
        const sidebarLogoutBtn = document.getElementById("sidebarLogoutBtn");
        const dropdownLogoutBtn = document.getElementById("dropdownLogoutBtn");
        if (sidebarLogoutBtn) sidebarLogoutBtn.addEventListener("click", () => AuthManager.logout());
        if (dropdownLogoutBtn) dropdownLogoutBtn.addEventListener("click", () => AuthManager.logout());

        // Restart Setup explicitly
        const restartSetupBtn = document.getElementById("restartSetupBtn");
        if (restartSetupBtn) {
            restartSetupBtn.addEventListener("click", () => {
                if (profileDropdownMenu) profileDropdownMenu.classList.remove("active");
                SetupWizardController.openWizard(true);
            });
        }

        // Mobile Menu
        const mobileMenuToggle = document.getElementById("mobileMenuToggle");
        const dashSidebar = document.getElementById("dashSidebar");
        if (mobileMenuToggle && dashSidebar) {
            mobileMenuToggle.addEventListener("click", () => {
                dashSidebar.classList.toggle("mobile-open");
            });
        }

        // Reset Data in Settings
        const resetUserDataBtn = document.getElementById("resetUserDataBtn");
        if (resetUserDataBtn) {
            resetUserDataBtn.addEventListener("click", () => {
                if (confirm("Are you sure you want to clear all your financial figures and restart setup?")) {
                    UserDataStore.resetAllData();
                    AppRouter.navigate("#/financial-setup");
                }
            });
        }

        // Save Settings
        const saveSettingsBtn = document.getElementById("saveSettingsBtn");
        if (saveSettingsBtn) {
            saveSettingsBtn.addEventListener("click", () => {
                const newName = document.getElementById("settingsNameInput").value.trim();
                if (newName) {
                    const user = AuthManager.getUser() || {};
                    user.name = newName;
                    localStorage.setItem("vortexUser", JSON.stringify(user));
                    DashboardRenderer.updateProfileUI(user);
                    this.triggerTypewriter();
                    alert("Account preferences updated successfully.");
                }
            });
        }
    },

    switchView(viewName) {
        document.querySelectorAll(".dash-view-pane").forEach((pane) => {
            pane.classList.remove("active");
        });

        const targetPane = document.getElementById(`view-${viewName}`);
        if (targetPane) targetPane.classList.add("active");
        else {
            const defaultPane = document.getElementById("view-overview");
            if (defaultPane) defaultPane.classList.add("active");
        }

        document.querySelectorAll(".sidebar-link").forEach((link) => {
            const linkRoute = link.getAttribute("data-route");
            if (linkRoute === viewName) link.classList.add("active");
            else link.classList.remove("active");
        });

        const topbarCurrentSection = document.getElementById("topbarCurrentSection");
        if (topbarCurrentSection) {
            topbarCurrentSection.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
        }

        if (viewName === "overview") {
            this.triggerTypewriter();
        }
    },

    triggerTypewriter() {
        const user = AuthManager.getUser() || { name: "User" };
        const name = user.name || "User";

        const hour = new Date().getHours();
        let timeOfDay = "evening";
        if (hour >= 5 && hour < 12) timeOfDay = "morning";
        else if (hour >= 12 && hour < 17) timeOfDay = "afternoon";

        const fullText = `Good ${timeOfDay}, ${name}`;
        const targetElement = document.getElementById("typewriterGreetingText");
        const subtitle = document.getElementById("greetingSubtitle");

        if (!targetElement) return;

        targetElement.textContent = "";
        if (subtitle) subtitle.classList.remove("visible");

        let charIndex = 0;
        if (this.typewriterInterval) clearInterval(this.typewriterInterval);

        this.typewriterInterval = setInterval(() => {
            if (charIndex < fullText.length) {
                targetElement.textContent += fullText.charAt(charIndex);
                charIndex++;
            } else {
                clearInterval(this.typewriterInterval);
                if (subtitle) {
                    setTimeout(() => subtitle.classList.add("visible"), 200);
                }
            }
        }, 40);
    }
};

/* ==========================================================================
   10. 3D VORTEX ANIMATION CONTROLLER (Public Landing Page)
   ========================================================================== */

(function initVortexCanvasPlayer() {
    const canvas = document.getElementById("vortexCanvas");
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    const totalFrames = 90;
    const targetFps = 30;
    const frameInterval = 1000 / targetFps;

    const frames = [];
    let currentFrameIndex = 0;
    let lastTimestamp = 0;
    let isInitialFrameDrawn = false;

    canvas.width = 1200;
    canvas.height = 1200;

    function getFramePath(index) {
        const paddedIndex = String(index).padStart(3, "0");
        return `ezgif-482f62ac9eb37c21-jpg/ezgif-frame-${paddedIndex}.jpg`;
    }

    function renderFrame(img) {
        if (!img || !img.complete || img.naturalWidth === 0) return;

        ctx.clearRect(0, 0, canvas.width, canvas.height);

        const imgWidth = img.naturalWidth;
        const imgHeight = img.naturalHeight;
        const imgRatio = imgWidth / imgHeight;
        const canvasRatio = canvas.width / canvas.height;

        let drawWidth, drawHeight, offsetX, offsetY;

        if (imgRatio > canvasRatio) {
            drawWidth = canvas.width;
            drawHeight = canvas.width / imgRatio;
            offsetX = 0;
            offsetY = (canvas.height - drawHeight) / 2;
        } else {
            drawHeight = canvas.height;
            drawWidth = canvas.height * imgRatio;
            offsetX = (canvas.width - drawWidth) / 2;
            offsetY = 0;
        }

        ctx.drawImage(img, offsetX, offsetY, drawWidth, drawHeight);
    }

    function animate(timestamp) {
        if (!lastTimestamp) lastTimestamp = timestamp;
        const elapsed = timestamp - lastTimestamp;

        if (elapsed >= frameInterval) {
            lastTimestamp = timestamp - (elapsed % frameInterval);

            const activeImg = frames[currentFrameIndex];
            if (activeImg && activeImg.complete && activeImg.naturalWidth > 0) {
                renderFrame(activeImg);
            }

            currentFrameIndex = (currentFrameIndex + 1) % totalFrames;
        }

        requestAnimationFrame(animate);
    }

    for (let i = 1; i <= totalFrames; i++) {
        const frameImg = new Image();
        frameImg.src = getFramePath(i);

        if (i === 1) {
            frameImg.onload = () => {
                if (!isInitialFrameDrawn) {
                    renderFrame(frameImg);
                    isInitialFrameDrawn = true;
                }
            };
        }

        frames.push(frameImg);
    }

    requestAnimationFrame(animate);
})();

/* ==========================================================================
   11. INITIALIZATION ON DOM READY
   ========================================================================== */

document.addEventListener("DOMContentLoaded", () => {
    AuthUI.init();
    SetupWizardController.init();
    EditMetricModal.init();
    TransactionModal.init();
    GoalModal.init();
    DashboardController.init();
    AppRouter.init();
});