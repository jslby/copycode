const Config = {
  VERSION: "2026.01.05",
  BATCH_SIZE: 40,
  BATCH_DELAY_MS: 600,
  ACCOUNT_DELAY_MS: 1000,
  DELETE_DELAY_MS: 300,
  API_VERSION: "v23.0",
  API_URL: "https://adsmanager-graph.facebook.com/v23.0/"
};

// ============================================
// Logger Class
// ============================================
class Logger {
  constructor(uiInstance = null) {
    this.ui = uiInstance;
  }
  
  setUI(uiInstance) {
    this.ui = uiInstance;
  }
  
  log(message, type = "info") {
    if (this.ui && this.ui.log) {
      this.ui.log(message, type);
    }
    // Also log to console for debugging
    if (type === "error") {
      console.error(message);
    } else {
      console.log(message);
    }
  }
  
  info(message) {
    this.log(message, "info");
  }
  
  error(message) {
    this.log(message, "error");
  }
  
  success(message) {
    this.log(message, "success");
  }
  
  warning(message) {
    this.log(message, "warning");
  }
}

// Global logger instance
const logger = new Logger();

// Legacy function for backward compatibility
function logMessage(message, type = "info") {
  logger.log(message, type);
}
// ============================================
// Currency Converter Class
// ============================================
class CurrencyConverter {
  static FIELDS = [
    "spent",
    "today_spent",
    "cost_per_purchase_fb",
    "cost_per_add_to_cart_fb",
    "cost_per_complete_registration_fb",
    "cost_per_view_content_fb",
    "cost_per_search_fb",
    "cost_per_initiate_checkout_fb",
    "cost_per_lead_fb",
    "cost_per_add_payment_info_fb",
    "cost_per_link_click",
    "cpc",
    "cpm"
  ];

  static OFFSETS = {
    "DZD": 100, "ARS": 100, "AUD": 100, "BHD": 100, "BDT": 100,
    "BOB": 100, "BGN": 100, "BRL": 100, "GBP": 100, "CAD": 100,
    "CLP": 1, "CNY": 100, "COP": 1, "CRC": 1, "HRK": 100,
    "CZK": 100, "DKK": 100, "EGP": 100, "EUR": 100, "GTQ": 100,
    "HNL": 100, "HKD": 100, "HUF": 1, "ISK": 1, "INR": 100,
    "IDR": 1, "ILS": 100, "JPY": 1, "JOD": 100, "KES": 100,
    "KRW": 1, "LVL": 100, "LTL": 100, "MOP": 100, "MYR": 100,
    "MXN": 100, "NZD": 100, "NIO": 100, "NGN": 100, "NOK": 100,
    "PKR": 100, "PYG": 1, "PEN": 100, "PHP": 100, "PLN": 100,
    "QAR": 100, "RON": 100, "RUB": 100, "SAR": 100, "RSD": 100,
    "SGD": 100, "SKK": 100, "ZAR": 100, "SEK": 100, "CHF": 100,
    "TWD": 1, "THB": 100, "TRY": 100, "AED": 100, "UAH": 100,
    "USD": 100, "UYU": 100, "VEF": 100, "VND": 1, "FBZ": 100, "VES": 100
  };

  static getOffset(currency) {
    return this.OFFSETS[currency] || 100;
  }

  static toUSD(rule, conversionRate, fromCurrency) {
    // Skip conversion if rate is 1 (already USD)
    if (conversionRate === 1) {
      return rule;
    }
    
    // Deep clone the rule to avoid modifying the original
    const convertedRule = JSON.parse(JSON.stringify(rule));
    
    // Get currency offsets
    const accountOffset = this.getOffset(fromCurrency);
    const usdOffset = this.getOffset("USD");
    
    // Convert currency values in evaluation_spec filters
    if (convertedRule.evaluation_spec && convertedRule.evaluation_spec.filters) {
      convertedRule.evaluation_spec.filters.forEach(filter => {
        if (filter.value && !isNaN(filter.value) && this.FIELDS.includes(filter.field)) {
          const originalValue = parseFloat(filter.value);
          const usdValue = (originalValue / conversionRate) * (usdOffset / accountOffset);
          filter.value = Math.round(usdValue).toString();
        }
      });
    }
    
    return convertedRule;
  }

  static fromUSD(rule, conversionRate, toCurrency) {
    // Skip conversion if rate is 1 (already USD)
    if (conversionRate === 1) {
      return rule;
    }
    
    // Deep clone the rule to avoid modifying the original
    const convertedRule = JSON.parse(JSON.stringify(rule));
    
    // Get currency offsets
    const accountOffset = this.getOffset(toCurrency);
    const usdOffset = this.getOffset("USD");
    
    // Convert currency values in evaluation_spec filters
    if (convertedRule.evaluation_spec && convertedRule.evaluation_spec.filters) {
      convertedRule.evaluation_spec.filters.forEach(filter => {
        if (filter.value && !isNaN(filter.value) && this.FIELDS.includes(filter.field)) {
          const usdValue = parseFloat(filter.value);
          const accountValue = usdValue / usdOffset * conversionRate * accountOffset;
          filter.value = Math.round(accountValue).toString();
        }
      });
    }
    
    return convertedRule;
  }
}

// Legacy constants for backward compatibility
const CURRENCY_FIELDS = CurrencyConverter.FIELDS;
const CURRENCY_OFFSETS = CurrencyConverter.OFFSETS;

// ============================================
// Utility Functions
// ============================================
function chunkArray(items, chunkSize) {
  if (!Array.isArray(items) || chunkSize <= 0) {
    return [];
  }
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function stringifyIfNeeded(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

// ============================================
// Account Manager Class
// ============================================
class AccountManager {
  constructor() {
    this.accounts = [];
  }
  
  async loadAll() {
    const api = new FbApi();
    try {
      logger.info("Loading all accounts with rule counts...");
      
      // Get all accounts with autorules count and currency info in a single request using field expansion
      const accounts = await api.getAllPages("me/adaccounts", "fields=id,name,account_status,currency,account_currency_ratio_to_usd,adrules_library.limit(100){id,name}");
      
      // Map accounts with rule counts from the data array
      this.accounts = accounts.map(account => {
        const accountId = account.id.replace("act_", "");
        const ruleCount = account.adrules_library?.data?.length || 0;
        
        return {
          id: accountId,
          name: account.name || accountId,
          ruleCount: ruleCount,
          status: account.account_status,
          currency: account.currency || "USD",
          conversionRate: account.account_currency_ratio_to_usd || 1
        };
      });
      
      logger.success(`Loaded ${this.accounts.length} accounts.`);
      return this.accounts;
    } catch (error) {
      logger.error("Error loading accounts:", error);
      throw error;
    }
  }
  
  getAll() {
    return this.accounts;
  }
  
  findById(accountId) {
    return this.accounts.find(acc => acc.id === accountId);
  }
  
  updateRuleCount(accountId, newCount) {
    const account = this.findById(accountId);
    if (account) {
      account.ruleCount = newCount;
    }
  }
  
  addToRuleCount(accountId, countToAdd) {
    const account = this.findById(accountId);
    if (account) {
      account.ruleCount += countToAdd;
    }
  }
}

// Global account manager instance
const accountManager = new AccountManager();

// ============================================
// Facebook API Class
// ============================================
class FbApi {
  apiUrl = Config.API_URL;

  async getRequest(path, qs = null, token = null) {
    token = token ?? __accessToken;
    let finalUrl = path.startsWith('http') ? path : this.apiUrl+path;
    
    // Check if URL already contains access_token (e.g., from pagination)
    const hasAccessToken = finalUrl.includes('access_token=');
    
    // Only add access_token if not already present
    if (!hasAccessToken) {
      qs = qs != null ? `${qs}&access_token=${token}` : `access_token=${token}`;
      const separator = finalUrl.includes('?') ? '&' : '?';
      finalUrl = `${finalUrl}${separator}${qs}`;
    } else if (qs) {
      // URL has access_token but we still need to append other params
      finalUrl = `${finalUrl}&${qs}`;
    }
    
    let f = await fetch(finalUrl, {
      headers: {
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.9",
        "accept-language": "ca-ES,ca;q=0.9,en-US;q=0.8,en;q=0.7",
        "cache-control": "max-age=0",
        "sec-ch-ua": '"Not?A_Brand";v="8", "Chromium";v="108", "Google Chrome";v="108"',
        "sec-ch-ua-mobile": "?0",
        "sec-ch-ua-platform": '"Windows"',
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-site",
      },
      referrerPolicy: "strict-origin-when-cross-origin",
      body: null,
      method: "GET",
      mode: "cors",
      credentials: "include",
      referrer: "https://business.facebook.com/",
      referrerPolicy: "origin-when-cross-origin",
    });
    let js = await f.json();
    return js;
  }

  async getAllPages(path, qs, token = null) {
    let items = [];
    let page = await this.getRequest(path, qs, token);
    items = items.concat(page.data);

    let i = 2;
    while (page.paging && page.paging.next) {
      page = await this.getRequest(page.paging.next, null, token);
      items = items.concat(page.data);
      i++;
    }

    return items;
  }

  async postRequest(path, body, token = null) {
    token = token ?? __accessToken;
    body["access_token"] = token;
    let headers = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      "sec-ch-ua": '"Google Chrome";v="107", "Chromium";v="107", "Not=A?Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    };
    let finalUrl = path.startsWith('http') ? path : this.apiUrl+path;
    let f = await fetch(finalUrl, {
      headers: headers,
      referrer: "https://business.facebook.com/",
      referrerPolicy: "origin-when-cross-origin",
      body: new URLSearchParams(body).toString(),
      method: "POST",
      mode: "cors",
      credentials: "include",
    });
    let json = await f.json();
    return json;
  }

  async postBatchRequest(batchEntries, extraParams = {}, token = null) {
    if (!Array.isArray(batchEntries) || batchEntries.length === 0) {
      return [];
    }
    token = token ?? __accessToken;
    const body = {
      access_token: token,
      include_headers: false,
      ...extraParams,
      batch: JSON.stringify(batchEntries),
    };
    let headers = {
      accept: "*/*",
      "accept-language": "en-US,en;q=0.9",
      "content-type": "application/x-www-form-urlencoded",
      "sec-ch-ua": '"Google Chrome";v="107", "Chromium";v="107", "Not=A?Brand";v="24"',
      "sec-ch-ua-mobile": "?0",
      "sec-ch-ua-platform": '"Windows"',
      "sec-fetch-dest": "empty",
      "sec-fetch-mode": "cors",
      "sec-fetch-site": "same-site",
    };
    let f = await fetch(this.apiUrl, {
      headers: headers,
      referrer: "https://business.facebook.com/",
      referrerPolicy: "origin-when-cross-origin",
      body: new URLSearchParams(body).toString(),
      method: "POST",
      mode: "cors",
      credentials: "include",
    });
    let json = await f.json();
    return json;
  }
}

class FbRules {
  fb = new FbApi();
  
  async getAllRules(accountId) {
    const allRules = await this.fb.getAllPages(`act_${accountId}/adrules_library`, "fields=id,name,evaluation_spec,execution_spec,schedule_spec,status&limit=100");
    return { data: allRules };
  }
  
  async clearRules(accountId) {
    let rules = await this.getAllRules(accountId);
    let rulesCount = rules.data.length;
    if (rulesCount == 0) return;
    console.log(`Deleting ${rulesCount} rules in batches...`);
    
    // Delete rules in batches
    const ruleIds = rules.data.map(rule => rule.id);
    const ruleChunks = chunkArray(ruleIds, Config.BATCH_SIZE);
    
    for (let chunkIndex = 0; chunkIndex < ruleChunks.length; chunkIndex++) {
      const chunk = ruleChunks[chunkIndex];
      console.log(`Deleting batch ${chunkIndex + 1}/${ruleChunks.length} (${chunk.length} rules)...`);
      
      try {
        await this.deleteRulesBatch(chunk);
      } catch (error) {
        console.error(`Error deleting batch ${chunkIndex + 1}:`, error);
        // Continue with next batch even if one fails
      }
      
      // Add delay between batches
      if (chunkIndex < ruleChunks.length - 1) {
        await new Promise(resolve => setTimeout(resolve, Config.BATCH_DELAY_MS));
      }
    }
  }
  
  async addRule(accountId, name, evalSpec, execSpec, schedSpec) {
    let body = {
      locale: "en_US",
      evaluation_spec: JSON.stringify(evalSpec),
      execution_spec: JSON.stringify(execSpec),
      name: name,
      schedule_spec: JSON.stringify(schedSpec),
      status: "ENABLED",
    };
    return await this.fb.postRequest(`act_${accountId}/adrules_library`, body);
  }

  async addRulesBatch(accountId, rules) {
    if (!Array.isArray(rules) || rules.length === 0) {
      return [];
    }
    const batchEntries = rules.map((rule, idx) => {
      const name = rule.name || `rule_${idx}`;
      const evalSpecStr = encodeURIComponent(stringifyIfNeeded(rule.evaluation_spec));
      const execSpecStr = encodeURIComponent(stringifyIfNeeded(rule.execution_spec));
      const schedSpecStr = encodeURIComponent(stringifyIfNeeded(rule.schedule_spec));
      const status = encodeURIComponent(rule.status || "ENABLED");
      const locale = encodeURIComponent(rule.locale || "en_US");
      const bodyParts = [
        `evaluation_spec=${evalSpecStr}`,
        `execution_spec=${execSpecStr}`,
        `locale=${locale}`,
        `name=${encodeURIComponent(name)}`,
        `schedule_spec=${schedSpecStr}`,
        `status=${status}`
      ];
      return {
        name: `rule_${idx}`,
        method: "POST",
        relative_url: `act_${accountId}/adrules_library`,
        body: bodyParts.join("&")
      };
    });
    return await this.fb.postBatchRequest(batchEntries, {
      _app: "ADS_MANAGER",
      _reqName: "rule creation"
    });
  }

  async delRule(ruleId) {
    let body = { method: "delete" };
    return await this.fb.postRequest(`${ruleId}?method=delete`, body);
  }

  async deleteRulesBatch(ruleIds) {
    if (!Array.isArray(ruleIds) || ruleIds.length === 0) {
      return [];
    }
    
    const batchEntries = ruleIds.map(ruleId => ({
      method: "DELETE",
      relative_url: ruleId
    }));
    
    return await this.fb.postBatchRequest(batchEntries);
  }

  async execRule(ruleId) {
    let body = {
      method: "post",
      locale: "en_US",
    };
    return await this.fb.postRequest(`${ruleId}/execute?method=post`, body);
  }
}

class FileSelector {
  constructor(fileProcessor) {
    this.fileProcessor = fileProcessor;
  }

  createDiv() {
    this.div = document.createElement("div");
    this.div.style.position = "fixed";
    this.div.style.top = "50%";
    this.div.style.left = "50%";
    this.div.style.transform = "translate(-50%, -50%)";
    this.div.style.width = "200px";
    this.div.style.height = "120px";
    this.div.style.backgroundColor = "yellow";
    this.div.style.zIndex = "1000";
    this.div.style.display = "flex";
    this.div.style.flexDirection = "column";
    this.div.style.alignItems = "center";
    this.div.style.justifyContent = "center";
    this.div.style.padding = "10px";
    this.div.style.boxSizing = "border-box";
    this.div.style.borderRadius = "10px";

    // Create and style the title
    var title = document.createElement("div");
    title.innerHTML = "Select file to import autorules";
    title.style.textAlign = "center";
    title.style.fontWeight = "bold";

    // Create and style the close button
    var closeButton = document.createElement("button");
    closeButton.innerHTML = "X";
    closeButton.style.position = "absolute";
    closeButton.style.top = "5px";
    closeButton.style.right = "5px";
    closeButton.style.border = "none";
    closeButton.style.background = "none";
    closeButton.style.cursor = "pointer";
    closeButton.onclick = () => {
      document.body.removeChild(this.div);
    };

    this.div.appendChild(title);
    this.div.appendChild(closeButton);
  }

  createFileInput() {
    // Create the file input and handle file selection
    this.fileInput = document.createElement("input");
    this.fileInput.type = "file";
    this.fileInput.accept = ".json";
    this.fileInput.style.display = "none";
  }

  createButton() {
    // Create the button
    this.button = document.createElement("button");
    this.button.textContent = "Select File";
    this.button.onclick = () => {
      this.fileInput.click();
    };
  }

  show() {
    return new Promise((resolve, reject) => {
      this.createDiv();
      this.createFileInput();
      this.createButton();

      // Append elements to the div and the div to the body
      this.div.appendChild(this.button);
      this.div.appendChild(this.fileInput);
      document.body.appendChild(this.div);

      this.fileInput.onchange = async () => {
        // If no file is selected (user cancelled)
        if (!this.fileInput.files || this.fileInput.files.length === 0) {
          document.body.removeChild(this.div);
          alert("Operation canceled");
          reject("File selection cancelled by user");
          return;
        }

        try {
          // Process the file and resolve the promise
          const result = await this.fileProcessor(this.fileInput.files[0]);
          document.body.removeChild(this.div);
          resolve(result);
        } catch (error) {
          // Handle any errors in processing
          document.body.removeChild(this.div);
          reject(error);
        }
      };
    });
  }
}

class FileHelper {
  async readFileAsJsonAsync(file) {
    try {
      const fileContent = await this.readFileAsync(file);
      return JSON.parse(fileContent);
    } catch (error) {
      console.error("Error:", error);
      throw error;
    }
  }

  readFileAsync(file) {
    return new Promise((resolve, reject) => {
      let reader = new FileReader();

      reader.onload = () => {
        resolve(reader.result);
      };

      reader.onerror = () => {
        reject("Error reading file");
      };

      reader.readAsText(file); // Read the file as text
    });
  }
}

// Helper function to convert currency values in rules
function convertCurrencyInRule(rule, conversionRate, accountCurrency) {
  // Skip conversion if rate is 1 (already USD)
  console.log("Conversion rate: ", conversionRate);
  console.log("Account currency: ", accountCurrency);
  if (conversionRate === 1) {
    return rule;
  }
  
  // Deep clone the rule to avoid modifying the original
  const convertedRule = JSON.parse(JSON.stringify(rule));
  
  // Get currency offsets
  const accountOffset = CURRENCY_OFFSETS[accountCurrency] || 100;
  const usdOffset = CURRENCY_OFFSETS["USD"] || 100;
  console.log("Account offset: ", accountOffset, "USD offset: ", usdOffset);
  
  // Convert currency values in evaluation_spec filters
  if (convertedRule.evaluation_spec && convertedRule.evaluation_spec.filters) {
    convertedRule.evaluation_spec.filters.forEach(filter => {
      // Check if this filter has a numeric value that might be currency
      if (filter.value && !isNaN(filter.value) && CURRENCY_FIELDS.includes(filter.field)) {
        
        // Convert the value to USD and round to 2 decimal places
        const originalValue = parseFloat(filter.value);
        // First convert to base value, then to USD, then adjust for USD offset
        const usdValue = (originalValue / conversionRate) * (usdOffset / accountOffset);
        console.log("Original value: ", originalValue, "USD value: ", usdValue)
        filter.value = Math.round(usdValue).toString();
      }
    });
  }
  
  return convertedRule;
}

// Helper function to convert currency values in rules back to original currency
function convertCurrencyFromUSD(rule, conversionRate, accountCurrency) {
  // Skip conversion if rate is 1 (already USD)
  if (conversionRate === 1) {
    return rule;
  }
  
  // Deep clone the rule to avoid modifying the original
  const convertedRule = JSON.parse(JSON.stringify(rule));
  
  // Get currency offsets
  const accountOffset = CURRENCY_OFFSETS[accountCurrency] || 100;
  const usdOffset = CURRENCY_OFFSETS["USD"] || 100;
  
  // Convert currency values in evaluation_spec filters
  if (convertedRule.evaluation_spec && convertedRule.evaluation_spec.filters) {
    convertedRule.evaluation_spec.filters.forEach(filter => {
      // Check if this filter has a numeric value that might be currency
      if (filter.value && !isNaN(filter.value) && CURRENCY_FIELDS.includes(filter.field)) {
        
        // Convert the value from USD to account currency and round to 2 decimal places
        const usdValue = parseFloat(filter.value);
        const accountValue = usdValue / usdOffset * conversionRate * accountOffset;
        console.log("USD value: ", usdValue, "Account value: ", accountValue)
        filter.value = Math.round(accountValue).toString();
      }
    });
  }
  
  return convertedRule;
}

function chunkArray(items, chunkSize) {
  if (!Array.isArray(items) || chunkSize <= 0) {
    return [];
  }
  const chunks = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}

function stringifyIfNeeded(value) {
  if (typeof value === "string") {
    return value;
  }
  return JSON.stringify(value);
}

// Main functions for autorules export/import
async function exportAutorules(accountId = null) {
  const api = new FbApi();
  const rulesApi = new FbRules();
  
  // If no accountId provided, try to get from current context
  if (!accountId) {
    accountId = require("BusinessUnifiedNavigationContext").adAccountID;
  }
  
  const errorLog = [];
  
  try {
    // Get account info from cached data
    logger.info(`Getting account info for ${accountId}...`);
    const accountData = accountManager.findById(accountId);
    const conversionRate = accountData?.conversionRate || 1;
    const currency = accountData?.currency || "USD";
    logger.info(`Account currency: ${currency}, conversion rate: ${conversionRate}`);
    
    // Get all rules for the account
    logger.info("Getting autorules...");
    const rulesResponse = await rulesApi.getAllRules(accountId);
    
    if (!rulesResponse.data || rulesResponse.data.length === 0) {
      const message = "No autorules found for this account.";
      logger.warning(message);
      return;
    }
    
    // Convert all currency values to USD
    const rulesInUSD = rulesResponse.data.map(rule => {
      try {
        // Parse JSON strings in rule
        if (typeof rule.evaluation_spec === 'string') {
          rule.evaluation_spec = JSON.parse(rule.evaluation_spec);
        }
        if (typeof rule.execution_spec === 'string') {
          rule.execution_spec = JSON.parse(rule.execution_spec);
        }
        if (typeof rule.schedule_spec === 'string') {
          rule.schedule_spec = JSON.parse(rule.schedule_spec);
        }
        
        // Extract only the required fields
        const extractedRule = {
          id: rule.id,
          name: rule.name,
          evaluation_spec: rule.evaluation_spec,
          execution_spec: rule.execution_spec,
          schedule_spec: rule.schedule_spec,
          status: rule.status
        };
        
        // Convert currency values
        return CurrencyConverter.toUSD(extractedRule, conversionRate, currency);
      } catch (ruleError) {
        const errorMessage = `Error processing rule ${rule.name || rule.id}: ${ruleError.message || ruleError}`;
        console.error(errorMessage);
        errorLog.push(errorMessage);
        return null;
      }
    }).filter(rule => rule !== null);
    
    // Prepare export data
    const exportData = {
      rules: rulesInUSD,
      metadata: {
        exportDate: new Date().toISOString(),
        sourceAccountId: accountId,
        sourceCurrency: currency,
        conversionRate: conversionRate
      }
    };
    
    // Create file for download
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `autorules_${accountId}_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
    
    const successMessage = `Successfully exported ${rulesInUSD.length} autorules (converted to USD).`;
    logger.success(successMessage);
    if (errorLog.length > 0) {
      errorLog.forEach(err => logger.error(err));
    }
  } catch (error) {
    const errorMessage = `Error exporting autorules: ${error.message || error}`;
    logger.error(errorMessage);
  }
}

// Helper function to import rules to a single account
async function importRulesToAccount(accountId, rules, clearExisting, mainErrorLog = []) {
  const rulesApi = new FbRules();
  const accountErrorLog = [];
  let importedCount = 0;
  
  try {
    // Get account info from cached data
    logger.info(`Getting info for account ${accountId}...`);
    const accountData = accountManager.findById(accountId);
    const conversionRate = accountData?.conversionRate || 1;
    const currency = accountData?.currency || "USD";
    const accountName = accountData?.name || accountId;
    logger.info(`Account: ${accountName}, currency: ${currency}`);
    
    // Clear existing rules if requested
    if (clearExisting) {
      console.log(`Checking for existing rules in account ${accountId}...`);
      const existingRules = await rulesApi.getAllRules(accountId);
      if (existingRules.data && existingRules.data.length > 0) {
        await rulesApi.clearRules(accountId);
        const clearMessage = `Cleared ${existingRules.data.length} existing autorules from account ${accountName} (${accountId}).`;
        console.log(clearMessage);
        accountErrorLog.push(clearMessage);
        if (mainErrorLog) mainErrorLog.push(clearMessage);
      }
    }
    
    // Import rules with currency conversion
    logMessage(`Importing ${rules.length} autorules to account ${accountId}...`);
    
    // Convert rules from USD to account currency
    const convertedRules = rules.map(rule => CurrencyConverter.fromUSD(rule, conversionRate, currency));
    const ruleChunks = chunkArray(convertedRules, Config.BATCH_SIZE);
    
    for (let chunkIndex = 0; chunkIndex < ruleChunks.length; chunkIndex++) {
      const chunk = ruleChunks[chunkIndex];
      try {
        const sanitizedRules = chunk.map(rule => {
          // Verify rule has all required fields
          if (!rule.name || !rule.evaluation_spec || !rule.execution_spec || !rule.schedule_spec) {
            const errorMessage = `Skipping rule ${rule.name || 'unknown'} for account ${accountName} (${accountId}): Missing required fields`;
            console.error(errorMessage);
            accountErrorLog.push(errorMessage);
            if (mainErrorLog) mainErrorLog.push(errorMessage);
            return null;
          }
          // Remove ID if present (to create a new rule)
          delete rule.id;
          return rule;
        }).filter(Boolean);
        
        if (sanitizedRules.length === 0) {
          continue;
        }
        
        logger.info(`Uploading rules ${chunkIndex * Config.BATCH_SIZE + 1}-${chunkIndex * Config.BATCH_SIZE + sanitizedRules.length} of ${convertedRules.length} via batch...`);
        const batchResponse = await rulesApi.addRulesBatch(accountId, sanitizedRules);
        
        if (!Array.isArray(batchResponse) || batchResponse.length === 0) {
          const errorMessage = `Batch response empty for account ${accountName} (${accountId}).`;
          console.error(errorMessage);
          accountErrorLog.push(errorMessage);
          if (mainErrorLog) mainErrorLog.push(errorMessage);
          continue;
        }
        
        for (let i = 0; i < sanitizedRules.length; i++) {
          const resp = batchResponse[i];
          const rule = sanitizedRules[i];
          try {
            if (!resp) {
              throw new Error("No response item");
            }
            const statusCode = resp.code;
            const body = resp.body ? JSON.parse(resp.body) : null;
            if (statusCode >= 200 && statusCode < 300 && !(body?.error)) {
              importedCount++;
            } else {
              const message = body?.error?.message || JSON.stringify(body) || "Unknown batch error";
              const errorMessage = `Error adding rule ${rule.name || 'unknown'} to account ${accountName} (${accountId}): ${message}`;
              console.error(errorMessage);
              accountErrorLog.push(errorMessage);
              if (mainErrorLog) mainErrorLog.push(errorMessage);
            }
          } catch (responseError) {
            const errorMessage = `Error parsing batch response for rule ${rule.name || 'unknown'}: ${responseError.message || responseError}`;
            console.error(errorMessage);
            accountErrorLog.push(errorMessage);
            if (mainErrorLog) mainErrorLog.push(errorMessage);
          }
        }
        
        if (chunkIndex < ruleChunks.length - 1) {
          logger.info(`Batch ${chunkIndex + 1}/${ruleChunks.length} complete. Waiting ${Config.BATCH_DELAY_MS}ms before next batch...`);
          await new Promise(resolve => setTimeout(resolve, Config.BATCH_DELAY_MS));
        }
      } catch (batchError) {
        const errorMessage = `Batch error for account ${accountName} (${accountId}): ${batchError.message || batchError}`;
        console.error(errorMessage);
        accountErrorLog.push(errorMessage);
        if (mainErrorLog) mainErrorLog.push(errorMessage);
      }
    }
    
    const successMessage = `Successfully imported ${importedCount}/${rules.length} autorules to ${accountName}.`;
    logger.success(successMessage);
    accountErrorLog.unshift(successMessage);
    if (mainErrorLog) mainErrorLog.push(successMessage);
    
    return { success: true, importedCount, totalRules: rules.length, errorLog: accountErrorLog };
  } catch (error) {
    const errorMessage = `Error processing account ${accountId}: ${error.message || error}`;
    console.error(errorMessage);
    accountErrorLog.push(errorMessage);
    if (mainErrorLog) mainErrorLog.push(errorMessage);
    return { success: false, importedCount, totalRules: rules.length, errorLog: accountErrorLog };
  }
}

async function importAutorulesToSelectedAccounts(accountIds, uiInstance) {
  const fileHelper = new FileHelper();
  const errorLog = [];
  
  try {
    // Let user select file
    const fileSelector = new FileSelector(file => fileHelper.readFileAsJsonAsync(file));
    const fileContent = await fileSelector.show();
    if (!fileContent) return;
    
    // Validate file content
    if (!fileContent.rules || !Array.isArray(fileContent.rules)) {
      const message = "Invalid file format. Expected a JSON file with 'rules' array.";
      logger.error(message);
      return;
    }
    
    // Check if we should clear existing rules (using the checkbox from the UI)
    const clearExisting = document.getElementById("ywbClearExistingRules").checked;
    logger.info(`Clear existing rules: ${clearExisting}`);
    
    // Process each account
    logger.info(`Processing ${accountIds.length} accounts...`);
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      logger.info(`Processing account ${accountId} (${i+1}/${accountIds.length})...`);
      
      // Import rules to this account
      const result = await importRulesToAccount(accountId, fileContent.rules, clearExisting, errorLog);
      
      if (result.success) {
        successCount++;
        // Update rule count
        if (clearExisting) {
          accountManager.updateRuleCount(accountId, result.importedCount);
        } else {
          accountManager.addToRuleCount(accountId, result.importedCount);
        }
      } else {
        failedCount++;
      }
      
      // Add delay between accounts to avoid rate limiting
      if (i < accountIds.length - 1) {
        logger.info(`Waiting ${Config.ACCOUNT_DELAY_MS}ms before processing next account...`);
        await new Promise(resolve => setTimeout(resolve, Config.ACCOUNT_DELAY_MS));
      }
    }
    
    // Refresh dropdowns with updated counts
    if (uiInstance) {
      uiInstance.refreshDropdowns();
    }
    
    const summaryMessage = `Processed ${accountIds.length} accounts: ${successCount} successful, ${failedCount} failed.`;
    logger.success(summaryMessage);
  } catch (error) {
    const errorMessage = `Error importing autorules: ${error.message || error}`;
    logger.error(errorMessage);
  }
}

// Delete rules from selected accounts
async function deleteRulesFromSelectedAccounts(accountIds, uiInstance) {
  const rulesApi = new FbRules();
  const errorLog = [];
  
  try {
    logger.info(`Deleting rules from ${accountIds.length} accounts...`);
    let successCount = 0;
    let failedCount = 0;
    
    for (let i = 0; i < accountIds.length; i++) {
      const accountId = accountIds[i];
      logger.info(`Deleting from account ${accountId} (${i+1}/${accountIds.length})...`);
      
      try {
        await rulesApi.clearRules(accountId);
        successCount++;
        // Update rule count to 0
        accountManager.updateRuleCount(accountId, 0);
        logger.success(`✓ Deleted rules from account ${accountId}`);
        errorLog.push(`Successfully deleted rules from account ${accountId}`);
      } catch (error) {
        failedCount++;
        const errorMessage = `Error deleting rules from account ${accountId}: ${error.message || error}`;
        console.error(errorMessage);
        errorLog.push(errorMessage);
      }
      
      // Add delay between accounts to avoid rate limiting
      if (i < accountIds.length - 1) {
        logger.info(`Waiting ${Config.ACCOUNT_DELAY_MS}ms before processing next account...`);
        await new Promise(resolve => setTimeout(resolve, Config.ACCOUNT_DELAY_MS));
      }
    }
    
    // Refresh dropdowns with updated counts
    if (uiInstance) {
      uiInstance.refreshDropdowns();
    }
    
    const summaryMessage = `Processed ${accountIds.length} accounts: ${successCount} successful, ${failedCount} failed.`;
    logger.success(summaryMessage);
  } catch (error) {
    const errorMessage = `Error deleting rules: ${error.message || error}`;
    logger.error(errorMessage);
  }
}

// Load all accounts with their rule counts
// Legacy wrapper for accountManager.loadAll()
async function loadAllAccountsWithRules() {
  return await accountManager.loadAll();
}

// Legacy wrapper for accountManager.updateRuleCount()
function updateAccountRuleCount(accountId, newCount) {
  accountManager.updateRuleCount(accountId, newCount);
}

// Legacy wrapper for accountManager.addToRuleCount()
function addToAccountRuleCount(accountId, countToAdd) {
  accountManager.addToRuleCount(accountId, countToAdd);
}

// Legacy global variable accessor
let allAccountsData = new Proxy({}, {
  get(target, prop) {
    if (typeof prop === 'symbol') return undefined;
    // Return the accounts array or methods
    const accounts = accountManager.getAll();
    if (prop === 'length') return accounts.length;
    if (prop === 'find') return accounts.find.bind(accounts);
    if (prop === 'map') return accounts.map.bind(accounts);
    if (prop === 'filter') return accounts.filter.bind(accounts);
    if (prop === 'forEach') return accounts.forEach.bind(accounts);
    return accounts[prop];
  }
});

// Create UI for autorules manager
class AutorulesManagerUI {
  constructor() {
    this.div = null;
    this.buttons = {};
    this.selectedExportAccountIds = [];
    this.selectedImportAccountIds = [];
    this.exportSearchQuery = "";
    this.importSearchQuery = "";
    this.logArea = null;
    this.logPanel = null;
  }

  createDiv() {
    this.div = document.createElement("div");
    this.div.style.position = "fixed";
    this.div.style.top = "50%";
    this.div.style.left = "50%";
    this.div.style.transform = "translate(-50%, -50%)";
    this.div.style.width = "400px";
    this.div.style.maxHeight = "90vh";
    this.div.style.overflowY = "auto";
    this.div.style.overflowX = "hidden";
    this.div.style.backgroundColor = "yellow";
    this.div.style.zIndex = "1000";
    this.div.style.display = "flex";
    this.div.style.flexDirection = "column";
    this.div.style.alignItems = "center";
    this.div.style.justifyContent = "flex-start";
    this.div.style.padding = "20px";
    this.div.style.boxSizing = "border-box";
    this.div.style.borderRadius = "10px";
    this.div.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";

    // Create and style the title
    const title = document.createElement("div");
    title.innerHTML = "<h2>FB Autorules Manager "+Config.VERSION+"</h2><p><a href='https://yellowweb.top' target='_blank'>by Yellow Web</a></p>";
    title.style.textAlign = "center";

    // Create and style the close button
    const closeButton = document.createElement("button");
    closeButton.innerHTML = "X";
    closeButton.style.position = "absolute";
    closeButton.style.top = "10px";
    closeButton.style.right = "10px";
    closeButton.style.border = "none";
    closeButton.style.background = "none";
    closeButton.style.fontSize = "18px";
    closeButton.style.cursor = "pointer";
    closeButton.onclick = () => {
      if (this.logPanel && this.logPanel.parentNode) {
        this.logPanel.parentNode.removeChild(this.logPanel);
      }
      document.body.removeChild(this.div);
    };
    
    // We've moved the copy as bookmark functionality to a link at the bottom

    this.div.appendChild(title);
    this.div.appendChild(closeButton);

    return this.div;
  }

  createButton(id, text, onClick) {
    const button = document.createElement("button");
    button.id = id;
    button.textContent = text;
    button.style.margin = "10px 0";
    button.style.padding = "10px 15px";
    button.style.width = "100%";
    button.style.backgroundColor = "#4CAF50";
    button.style.color = "white";
    button.style.border = "none";
    button.style.borderRadius = "5px";
    button.style.cursor = "pointer";
    button.style.fontSize = "16px";
    button.setAttribute("data-original-text", text);
    
    // Store the button in the buttons object
    this.buttons[id] = button;
    
    // Create a wrapper for the onClick function that handles button state
    button.onclick = async () => {
      this.setButtonLoading(id, true);
      try {
        await onClick();
      } finally {
        this.setButtonLoading(id, false);
      }
    };

    return button;
  }
  
  // Method to set button to loading state
  setButtonLoading(id, isLoading) {
    const button = this.buttons[id];
    if (!button) return;
    
    if (isLoading) {
      button.disabled = true;
      button.style.opacity = "0.7";
      button.style.cursor = "not-allowed";
      button.textContent = "Working on it...";
    } else {
      button.disabled = false;
      button.style.opacity = "1";
      button.style.cursor = "pointer";
      button.textContent = button.getAttribute("data-original-text");
    }
  }

  createSearchInput(id, placeholder, onInput) {
    const input = document.createElement("input");
    input.type = "text";
    input.id = id;
    input.placeholder = placeholder;
    input.style.width = "100%";
    input.style.padding = "6px 8px";
    input.style.borderRadius = "5px";
    input.style.border = "1px solid #ccc";
    input.style.fontSize = "12px";
    input.style.marginBottom = "6px";
    input.oninput = () => onInput(input.value);
    return input;
  }

  buildAccountOptions(select, selectedIds, accounts = allAccountsData) {
    const accountList = Array.isArray(accounts) ? accounts : Array.from(accounts || []);
    select.innerHTML = "";
    if (accountList.length === 0) {
      const option = document.createElement("option");
      option.value = "";
      option.textContent = "No matches";
      option.disabled = true;
      select.appendChild(option);
      return;
    }

    accountList.forEach(account => {
      const option = document.createElement("option");
      option.value = account.id;
      option.textContent = `${account.id} - ${account.name} [${account.ruleCount} rules]`;
      option.dataset.search = `${account.id} ${account.name}`.toLowerCase();
      if (selectedIds.includes(account.id)) {
        option.selected = true;
      }
      select.appendChild(option);
    });
    select.scrollTop = 0;
  }

  applyAccountSearch(select, query, mode) {
    const normalized = (query || "").trim().toLowerCase();
    if (mode === "export") {
      this.exportSearchQuery = normalized;
    } else {
      this.importSearchQuery = normalized;
    }
    const selectedIds = mode === "export" ? this.selectedExportAccountIds : this.selectedImportAccountIds;
    const allAccountsList = Array.isArray(allAccountsData) ? allAccountsData : Array.from(allAccountsData || []);
    const filteredAccounts = !normalized
      ? allAccountsList
      : allAccountsList.filter(account => {
          const haystack = `${account.id} ${account.name || ""}`.toLowerCase();
          return haystack.includes(normalized);
        });
    this.buildAccountOptions(select, selectedIds, filteredAccounts);
    const size = Math.min(Math.max(filteredAccounts.length, 2), 8);
    select.size = size;
  }
  
  // Create multi-select list for export
  createExportAccountDropdown() {
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.margin = "10px 0";
    
    const label = document.createElement("label");
    label.textContent = "Select accounts to export from:";
    label.style.display = "block";
    label.style.marginBottom = "5px";
    label.style.fontSize = "14px";
    label.style.fontWeight = "bold";

    const selectAllContainer = document.createElement("div");
    selectAllContainer.style.marginBottom = "5px";

    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "ywbSelectAllExportAccounts";
    selectAllCheckbox.style.marginRight = "5px";

    const selectAllLabel = document.createElement("label");
    selectAllLabel.htmlFor = "ywbSelectAllExportAccounts";
    selectAllLabel.textContent = "Select All Accounts";
    selectAllLabel.style.fontSize = "12px";
    selectAllLabel.style.fontStyle = "italic";

    selectAllContainer.appendChild(selectAllCheckbox);
    selectAllContainer.appendChild(selectAllLabel);

    const select = document.createElement("select");
    select.id = "ywbExportAccountSelect";
    select.multiple = true;
    select.size = Math.min(allAccountsData.length, 8);
    select.style.width = "100%";
    select.style.padding = "5px";
    select.style.borderRadius = "5px";
    select.style.border = "1px solid #ccc";
    select.style.fontSize = "12px";

    this.buildAccountOptions(select, this.selectedExportAccountIds);

    const searchInput = this.createSearchInput(
      "ywbExportAccountSearch",
      "Search by name or ID",
      value => this.applyAccountSearch(select, value, "export")
    );

    const updateSelection = () => {
      this.selectedExportAccountIds = Array.from(select.selectedOptions).map(opt => opt.value);
    };

    select.onchange = updateSelection;

    selectAllCheckbox.onchange = () => {
      Array.from(select.options).forEach(opt => {
        if (opt.disabled) {
          opt.selected = false;
          return;
        }
        if (selectAllCheckbox.checked) {
          opt.selected = true;
        } else {
          opt.selected = false;
        }
      });
      updateSelection();
    };

    container.appendChild(label);
    container.appendChild(searchInput);
    container.appendChild(selectAllContainer);
    container.appendChild(select);
    
    return container;
  }
  
  // Create multi-select dropdown for import
  createImportAccountDropdown() {
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.margin = "10px 0";
    
    const label = document.createElement("label");
    label.textContent = "Select accounts to import to:";
    label.style.display = "block";
    label.style.marginBottom = "5px";
    label.style.fontSize = "14px";
    label.style.fontWeight = "bold";

    const selectAllContainer = document.createElement("div");
    selectAllContainer.style.marginBottom = "5px";
    
    const selectAllCheckbox = document.createElement("input");
    selectAllCheckbox.type = "checkbox";
    selectAllCheckbox.id = "ywbSelectAllAccounts";
    selectAllCheckbox.style.marginRight = "5px";
    
    const selectAllLabel = document.createElement("label");
    selectAllLabel.htmlFor = "ywbSelectAllAccounts";
    selectAllLabel.textContent = "Select All Accounts";
    selectAllLabel.style.fontSize = "12px";
    selectAllLabel.style.fontStyle = "italic";
    
    selectAllContainer.appendChild(selectAllCheckbox);
    selectAllContainer.appendChild(selectAllLabel);
    
    const select = document.createElement("select");
    select.id = "ywbImportAccountSelect";
    select.multiple = true;
    select.size = Math.min(allAccountsData.length, 8);
    select.style.width = "100%";
    select.style.padding = "5px";
    select.style.borderRadius = "5px";
    select.style.border = "1px solid #ccc";
    select.style.fontSize = "12px";
    
    this.buildAccountOptions(select, this.selectedImportAccountIds);

    const searchInput = this.createSearchInput(
      "ywbImportAccountSearch",
      "Search by name or ID",
      value => this.applyAccountSearch(select, value, "import")
    );
    
    // Store selected accounts
    const updateSelection = () => {
      this.selectedImportAccountIds = Array.from(select.selectedOptions).map(opt => opt.value);
    };
    
    select.onchange = updateSelection;
    
    // Select all checkbox functionality
    selectAllCheckbox.onchange = () => {
      Array.from(select.options).forEach(opt => {
        if (opt.disabled) {
          opt.selected = false;
          return;
        }
        if (selectAllCheckbox.checked) {
          opt.selected = true;
        } else {
          opt.selected = false;
        }
      });
      updateSelection();
    };
    
    container.appendChild(label);
    container.appendChild(searchInput);
    container.appendChild(selectAllContainer);
    container.appendChild(select);
    
    return container;
  }
  
  // Refresh dropdown options with updated rule counts
  refreshDropdowns() {
    const exportSelect = document.getElementById("ywbExportAccountSelect");
    const importSelect = document.getElementById("ywbImportAccountSelect");
    
    if (exportSelect) {
      this.buildAccountOptions(exportSelect, this.selectedExportAccountIds);
      this.applyAccountSearch(exportSelect, this.exportSearchQuery, "export");
    }
    
    if (importSelect) {
      this.buildAccountOptions(importSelect, this.selectedImportAccountIds);
      this.applyAccountSearch(importSelect, this.importSearchQuery, "import");
    }
  }

  createTabs() {
    // Tab container
    const tabContainer = document.createElement("div");
    tabContainer.style.display = "flex";
    tabContainer.style.width = "100%";
    tabContainer.style.marginBottom = "15px";
    tabContainer.style.borderBottom = "2px solid #333";
    
    // Export/Delete tab
    const exportTab = document.createElement("button");
    exportTab.id = "ywbExportTab";
    exportTab.textContent = "Export / Delete";
    exportTab.style.flex = "1";
    exportTab.style.padding = "10px";
    exportTab.style.border = "none";
    exportTab.style.background = "none";
    exportTab.style.cursor = "pointer";
    exportTab.style.fontSize = "14px";
    exportTab.style.fontWeight = "bold";
    exportTab.style.borderBottom = "3px solid #333";
    
    // Import tab
    const importTab = document.createElement("button");
    importTab.id = "ywbImportTab";
    importTab.textContent = "Import";
    importTab.style.flex = "1";
    importTab.style.padding = "10px";
    importTab.style.border = "none";
    importTab.style.background = "none";
    importTab.style.cursor = "pointer";
    importTab.style.fontSize = "14px";
    importTab.style.fontWeight = "bold";
    
    // Tab click handlers
    exportTab.onclick = () => {
      exportTab.style.borderBottom = "3px solid #333";
      importTab.style.borderBottom = "none";
      document.getElementById("ywbExportTabContent").style.display = "block";
      document.getElementById("ywbImportTabContent").style.display = "none";
    };
    
    importTab.onclick = () => {
      importTab.style.borderBottom = "3px solid #333";
      exportTab.style.borderBottom = "none";
      document.getElementById("ywbExportTabContent").style.display = "none";
      document.getElementById("ywbImportTabContent").style.display = "block";
    };
    
    tabContainer.appendChild(exportTab);
    tabContainer.appendChild(importTab);
    
    return tabContainer;
  }
  
  // Create log area
  createLogArea() {
    const logContainer = document.createElement("div");
    logContainer.style.width = "100%";
    logContainer.style.marginTop = "15px";
    logContainer.style.borderTop = "2px solid #333";
    logContainer.style.paddingTop = "10px";

    const logHeader = document.createElement("div");
    logHeader.style.display = "flex";
    logHeader.style.alignItems = "center";
    logHeader.style.justifyContent = "space-between";
    logHeader.style.marginBottom = "5px";

    const logLabel = document.createElement("div");
    logLabel.textContent = "Log:";
    logLabel.style.fontSize = "12px";
    logLabel.style.fontWeight = "bold";

    const toggleButton = document.createElement("button");
    toggleButton.type = "button";
    toggleButton.textContent = "Show";
    toggleButton.style.fontSize = "11px";
    toggleButton.style.padding = "2px 6px";
    toggleButton.style.border = "1px solid #333";
    toggleButton.style.borderRadius = "4px";
    toggleButton.style.cursor = "pointer";
    toggleButton.style.background = "white";
    toggleButton.style.color = "#333";

    this.logPanel = document.createElement("div");
    this.logPanel.id = "ywbLogPanel";
    this.logPanel.style.position = "fixed";
    this.logPanel.style.top = "0";
    this.logPanel.style.left = "0";
    this.logPanel.style.width = "0";
    this.logPanel.style.height = "0";
    this.logPanel.style.backgroundColor = "yellow";
    this.logPanel.style.borderRadius = "10px";
    this.logPanel.style.boxShadow = "0 4px 8px rgba(0, 0, 0, 0.2)";
    this.logPanel.style.padding = "12px";
    this.logPanel.style.boxSizing = "border-box";
    this.logPanel.style.overflow = "hidden";
    this.logPanel.style.display = "none";
    this.logPanel.style.zIndex = "1001";
    this.logPanel.style.flexDirection = "column";
    this.logPanel.style.alignItems = "stretch";
    this.logPanel.style.gap = "6px";

    const panelHeader = document.createElement("div");
    panelHeader.textContent = "Log";
    panelHeader.style.fontSize = "12px";
    panelHeader.style.fontWeight = "bold";
    panelHeader.style.marginBottom = "6px";

    this.logArea = document.createElement("div");
    this.logArea.id = "ywbLogArea";
    this.logArea.style.width = "100%";
    this.logArea.style.flex = "1 1 auto";
    this.logArea.style.minHeight = "0";
    this.logArea.style.overflowY = "auto";
    this.logArea.style.backgroundColor = "#f5f5f5";
    this.logArea.style.border = "1px solid #ccc";
    this.logArea.style.borderRadius = "5px";
    this.logArea.style.padding = "8px";
    this.logArea.style.boxSizing = "border-box";
    this.logArea.style.fontSize = "11px";
    this.logArea.style.fontFamily = "monospace";
    this.logArea.style.lineHeight = "1.4";
    this.logArea.style.wordBreak = "break-word";
    this.logArea.style.overflowX = "hidden";

    this.logPanel.appendChild(panelHeader);
    this.logPanel.appendChild(this.logArea);

    toggleButton.onclick = () => {
      const isHidden = this.logPanel.style.display === "none";
      if (isHidden) {
        this.positionLogPanel();
      }
      this.logPanel.style.display = isHidden ? "flex" : "none";
      toggleButton.textContent = isHidden ? "Hide" : "Show";
    };
    
    logHeader.appendChild(logLabel);
    logHeader.appendChild(toggleButton);
    logContainer.appendChild(logHeader);
    return logContainer;
  }

  positionLogPanel() {
    if (!this.div || !this.logPanel) return;
    const rect = this.div.getBoundingClientRect();
    const gap = 12;
    const rightPadding = 12;
    const top = Math.max(gap, rect.top);
    const left = rect.right + gap;
    const availableWidth = Math.max(0, window.innerWidth - left - rightPadding);
    const height = Math.min(rect.height, window.innerHeight - top - gap);
    this.logPanel.style.top = `${top}px`;
    this.logPanel.style.left = `${left}px`;
    this.logPanel.style.width = `${availableWidth}px`;
    this.logPanel.style.height = `${height}px`;
  }
  
  // Add message to log
  log(message, type = "info") {
    if (!this.logArea) return;
    
    const logEntry = document.createElement("div");
    logEntry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    
    if (type === "error") {
      logEntry.style.color = "red";
    } else if (type === "success") {
      logEntry.style.color = "green";
    } else if (type === "warning") {
      logEntry.style.color = "orange";
    }
    
    this.logArea.appendChild(logEntry);
    // Auto-scroll to bottom
    this.logArea.scrollTop = this.logArea.scrollHeight;
  }
  
  // Clear log
  clearLog() {
    if (this.logArea) {
      this.logArea.innerHTML = "";
    }
  }

  show() {
    const div = this.createDiv();

    // Create a small link for copying as bookmark
    const copyBookmarkLink = document.createElement("a");
    copyBookmarkLink.href = "#";
    copyBookmarkLink.textContent = "Copy as bookmark";
    copyBookmarkLink.style.fontSize = "12px";
    copyBookmarkLink.style.color = "blue";
    copyBookmarkLink.style.textDecoration = "underline";
    copyBookmarkLink.style.cursor = "pointer";
    copyBookmarkLink.style.marginTop = "5px";
    copyBookmarkLink.style.display = "block";
    copyBookmarkLink.style.textAlign = "center";
    copyBookmarkLink.onclick = (e) => {
      e.preventDefault();
      copyScriptAsBase64Bookmarklet();
    };

    div.appendChild(copyBookmarkLink);

    // Create tabs
    const tabs = this.createTabs();
    div.appendChild(tabs);

    // Export/Delete Tab Content
    const exportTabContent = document.createElement("div");
    exportTabContent.id = "ywbExportTabContent";
    exportTabContent.style.width = "100%";
    exportTabContent.style.display = "block";
    
    const exportDropdown = this.createExportAccountDropdown();
    
    const exportButton = this.createButton("export-btn", "Export Autorules to JSON", async () => {
      if (!this.selectedExportAccountIds || this.selectedExportAccountIds.length === 0) {
        alert("Please select at least one account to export from.");
        return;
      }
      for (let i = 0; i < this.selectedExportAccountIds.length; i++) {
        await exportAutorules(this.selectedExportAccountIds[i]);
        if (i < this.selectedExportAccountIds.length - 1) {
          await new Promise(resolve => setTimeout(resolve, Config.ACCOUNT_DELAY_MS));
        }
      }
    });
    
    const deleteButton = this.createButton("delete-export-btn", "Delete Rules from Selected Accounts", async () => {
      if (!this.selectedExportAccountIds || this.selectedExportAccountIds.length === 0) {
        alert("Please select at least one account to delete rules from.");
        return;
      }
      
      const confirmMsg = `Are you sure you want to delete all rules from ${this.selectedExportAccountIds.length} selected account(s)?`;
      if (!confirm(confirmMsg)) {
        return;
      }
      
      await deleteRulesFromSelectedAccounts(this.selectedExportAccountIds, this);
    });
    
    exportTabContent.appendChild(exportDropdown);
    exportTabContent.appendChild(exportButton);
    exportTabContent.appendChild(deleteButton);

    // Import Tab Content
    const importTabContent = document.createElement("div");
    importTabContent.id = "ywbImportTabContent";
    importTabContent.style.width = "100%";
    importTabContent.style.display = "none";
    
    const importDropdown = this.createImportAccountDropdown();
    
    const checkboxContainer = document.createElement("div");
    checkboxContainer.style.display = "flex";
    checkboxContainer.style.alignItems = "center";
    checkboxContainer.style.margin = "10px 0";
    checkboxContainer.style.width = "100%";
    
    const checkbox = document.createElement("input");
    checkbox.type = "checkbox";
    checkbox.id = "ywbClearExistingRules";
    checkbox.style.marginRight = "10px";
    
    const label = document.createElement("label");
    label.htmlFor = "ywbClearExistingRules";
    label.textContent = "Delete existing rules before import";
    label.style.fontSize = "14px";
    
    checkboxContainer.appendChild(checkbox);
    checkboxContainer.appendChild(label);
    
    const importButton = this.createButton("import-btn", "Import Autorules to Selected Accounts", async () => {
      if (!this.selectedImportAccountIds || this.selectedImportAccountIds.length === 0) {
        alert("Please select at least one account to import to.");
        return;
      }
      await importAutorulesToSelectedAccounts(this.selectedImportAccountIds, this);
    });
    
    importTabContent.appendChild(importDropdown);
    importTabContent.appendChild(checkboxContainer);
    importTabContent.appendChild(importButton);

    // Add tab contents to div
    div.appendChild(exportTabContent);
    div.appendChild(importTabContent);
    
    // Add log area
    const logArea = this.createLogArea();
    div.appendChild(logArea);
    if (this.logPanel) {
      document.body.appendChild(this.logPanel);
    }
    
    // Add div to body
    document.body.appendChild(div);
    
    // Initial log message
    this.log("UI initialized. Ready to work.", "success");
  }
}

// Main function to show the autorules manager UI
async function showAutorulesManager() {
  try {
    // Show loading message
    const loadingDiv = document.createElement("div");
    loadingDiv.style.position = "fixed";
    loadingDiv.style.top = "50%";
    loadingDiv.style.left = "50%";
    loadingDiv.style.transform = "translate(-50%, -50%)";
    loadingDiv.style.padding = "20px";
    loadingDiv.style.backgroundColor = "yellow";
    loadingDiv.style.borderRadius = "10px";
    loadingDiv.style.zIndex = "1000";
    loadingDiv.style.fontSize = "16px";
    loadingDiv.style.fontWeight = "bold";
    loadingDiv.textContent = "Loading accounts...";
    document.body.appendChild(loadingDiv);
    
    // Load all accounts with rule counts
    await loadAllAccountsWithRules();
    
    // Remove loading message
    document.body.removeChild(loadingDiv);
    
    // Show UI
    const ui = new AutorulesManagerUI();
    logger.setUI(ui);
    ui.show();
  } catch (error) {
    console.error("Error loading accounts:", error);
    alert(`Error loading accounts: ${error.message || error}`);
  }
}

// Function to copy the script as base64 bookmarklet
function copyScriptAsBase64Bookmarklet() {
  try {
    // Get the script URL - we'll use the current script's location
    const scriptUrl = window.location.href;
    
    // Create a string with all the code from this file
    // Since we can't easily get the source code in this context, we'll recreate it
    const scriptContent = `// Configuration and Classes
const Config = ${JSON.stringify(Config)};

${Logger.toString()}

const logger = new Logger();

function logMessage(message, type = "info") {
  logger.log(message, type);
}

${CurrencyConverter.toString()}

const CURRENCY_FIELDS = CurrencyConverter.FIELDS;
const CURRENCY_OFFSETS = CurrencyConverter.OFFSETS;

${chunkArray.toString()}

${stringifyIfNeeded.toString()}

${AccountManager.toString()}

const accountManager = new AccountManager();

${FbApi.toString()}

${FbRules.toString()}

${FileSelector.toString()}

${FileHelper.toString()}

function convertCurrencyInRule(rule, conversionRate, accountCurrency) {
  return CurrencyConverter.toUSD(rule, conversionRate, accountCurrency);
}

function convertCurrencyFromUSD(rule, conversionRate, accountCurrency) {
  return CurrencyConverter.fromUSD(rule, conversionRate, accountCurrency);
}

${exportAutorules.toString()}

${importRulesToAccount.toString()}

${importAutorulesToSelectedAccounts.toString()}

${deleteRulesFromSelectedAccounts.toString()}

${loadAllAccountsWithRules.toString()}

${updateAccountRuleCount.toString()}

${addToAccountRuleCount.toString()}

let allAccountsData = new Proxy({}, {
  get(target, prop) {
    if (typeof prop === 'symbol') return undefined;
    const accounts = accountManager.getAll();
    if (prop === 'length') return accounts.length;
    if (prop === 'find') return accounts.find.bind(accounts);
    if (prop === 'map') return accounts.map.bind(accounts);
    if (prop === 'filter') return accounts.filter.bind(accounts);
    if (prop === 'forEach') return accounts.forEach.bind(accounts);
    return accounts[prop];
  }
});

${AutorulesManagerUI.toString()}

${showAutorulesManager.toString()}

${copyScriptAsBase64Bookmarklet.toString()}

// Make the functions available globally
window.showAutorulesManager = showAutorulesManager;
window.copyScriptAsBase64Bookmarklet = copyScriptAsBase64Bookmarklet;

// Auto-run when script is loaded
showAutorulesManager();`;
    
    // Encode the script content as base64 (UTF-8 safe)
    const base64Content = btoa(unescape(encodeURIComponent(scriptContent)));
    
    // Format the string as requested (decode UTF-8 properly)
    const bookmarkletCode = `javascript:eval("(async () => {" + decodeURIComponent(escape(atob("${base64Content}"))) + "})();");`;
    
    // Copy to clipboard
    navigator.clipboard.writeText(bookmarkletCode)
      .then(() => {
        alert("Bookmarklet copied to clipboard!");
      })
      .catch(err => {
        console.error('Failed to copy: ', err);
        // Fallback for browsers that don't support clipboard API
        const textArea = document.createElement("textarea");
        textArea.value = bookmarkletCode;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand("copy");
        document.body.removeChild(textArea);
        alert("Bookmarklet copied to clipboard!");
      });
  } catch (error) {
    console.error('Error creating bookmarklet:', error);
    alert(`Error creating bookmarklet: ${error.message}`);
  }
}

// Make the functions available globally
window.showAutorulesManager = showAutorulesManager;
window.copyScriptAsBase64Bookmarklet = copyScriptAsBase64Bookmarklet;

// Auto-run when script is loaded
showAutorulesManager();
