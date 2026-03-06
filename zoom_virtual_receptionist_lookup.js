/*
Zoom AI Studio (Virtual Receptionist) Tool Script
=================================================
Use case:
- Inbound call comes in.
- Script reads caller number from Zoom AI Studio variables.
- Script looks up that number in Zoom Phone users.
- Script returns a structured object you can branch on in your flow.

IMPORTANT SETUP NOTES
---------------------
1) Add these variables in your tool/global variables (or rename keys below):
   - caller_number (or whichever inbound ANI/caller ID variable your flow provides)
   - zm_account_id
   - zm_client_id
   - zm_client_secret

2) If your environment uses a different caller variable name, set one of:
   - caller_number
   - ani
   - from_number
   - inbound_caller_id
   - (or customize CALLER_NUMBER_KEYS below)

3) Optional settings:
   - default_country_code (example: "1")
   - match_mode: "exact", "ends_with", or "both" (default)
   - enable_debug: "true" or "false"

4) This script avoids logging secrets and can safely run even if var_set is unavailable.
*/

async function main() {
  // =========================================================
  // CONFIGURATION (customize these variable names if needed)
  // =========================================================

  // Where to pull inbound caller-id from your Zoom environment.
  // Add your real variable names in priority order (first non-empty wins).
  var CALLER_NUMBER_KEYS = [
    "caller_number",      // <-- most common custom mapping
    "ani",                // <-- common telephony naming
    "from_number",        // <-- alternate naming
    "inbound_caller_id"   // <-- alternate naming
  ];

  // S2S OAuth credentials (set these variables in Zoom AI Studio)
  var ACCOUNT_ID_KEY = "zm_account_id";       // <-- Zoom Account ID
  var CLIENT_ID_KEY = "zm_client_id";         // <-- Zoom OAuth S2S Client ID
  var CLIENT_SECRET_KEY = "zm_client_secret"; // <-- Zoom OAuth S2S Client Secret

  // Optional behavior controls
  var DEFAULT_COUNTRY_CODE_KEY = "default_country_code"; // e.g. "1"
  var MATCH_MODE_KEY = "match_mode";                     // exact | ends_with | both
  var ENABLE_DEBUG_KEY = "enable_debug";                 // true | false
  var MAX_PAGES_KEY = "max_pages";                       // optional safety cap, default 50

  // Optional write-back variables for downstream flow steps
  var OUTPUT_FOUND_KEY = "caller_found";
  var OUTPUT_USER_ID_KEY = "caller_user_id";
  var OUTPUT_DISPLAY_NAME_KEY = "caller_display_name";
  var OUTPUT_MATCHED_NUMBER_KEY = "caller_matched_phone_number";
  var OUTPUT_MATCH_REASON_KEY = "caller_match_reason";

  // =========================================================
  // Helpers
  // =========================================================
  function getVar(vars, key, fallback) {
    var v = vars[key];
    return (v === undefined || v === null || String(v).trim() === "") ? fallback : v;
  }

  function getFirstNonEmpty(vars, keys) {
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      var v = vars[k];
      if (v !== undefined && v !== null && String(v).trim() !== "") {
        return { key: k, value: String(v).trim() };
      }
    }
    return { key: "", value: "" };
  }

  function asBool(raw, fallback) {
    var s = String(raw === undefined || raw === null ? "" : raw).toLowerCase().trim();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
    return fallback;
  }

  function asInt(raw, fallback) {
    var n = parseInt(String(raw), 10);
    return isNaN(n) ? fallback : n;
  }

  function digitsOnly(s) {
    return String(s || "").replace(/\D/g, "");
  }

  function normalizePhone(raw, defaultCountryCode) {
    // Handles:
    // - +E.164 values (keeps + and digits)
    // - local formats with punctuation
    // - 10-digit local values with default country code
    if (!raw) return "";
    var input = String(raw).trim();
    if (!input) return "";

    var plus = input.charAt(0) === "+";
    var digits = digitsOnly(input);
    if (!digits) return "";

    if (plus) return "+" + digits;

    if (digits.length === 10 && defaultCountryCode) {
      return "+" + digitsOnly(defaultCountryCode) + digits;
    }

    // Generic fallback; still useful for matching.
    return "+" + digits;
  }

  function last10(raw) {
    var d = digitsOnly(raw);
    return d.length > 10 ? d.slice(d.length - 10) : d;
  }

  function is2xx(status) {
    return status >= 200 && status < 300;
  }

  function safeStringify(obj) {
    try {
      return JSON.stringify(obj || {});
    } catch (e) {
      return "{}";
    }
  }

  function maybeSetVar(key, value) {
    // var_set may not exist in all runtime variants; fail-safe no-op
    if (typeof var_set === "function") {
      var_set(key, value);
    }
  }

  // =========================================================
  // Runtime inputs
  // =========================================================
  var vars = var_get();

  var callerPick = getFirstNonEmpty(vars, CALLER_NUMBER_KEYS);
  var callerRaw = callerPick.value;

  var accountId = getVar(vars, ACCOUNT_ID_KEY, "");
  var clientId = getVar(vars, CLIENT_ID_KEY, "");
  var clientSecret = getVar(vars, CLIENT_SECRET_KEY, "");

  var defaultCountryCode = getVar(vars, DEFAULT_COUNTRY_CODE_KEY, "1");
  var matchMode = String(getVar(vars, MATCH_MODE_KEY, "both")).toLowerCase().trim();
  var enableDebug = asBool(getVar(vars, ENABLE_DEBUG_KEY, "false"), false);
  var maxPages = asInt(getVar(vars, MAX_PAGES_KEY, "50"), 50);
  if (maxPages < 1) maxPages = 1;

  function debug(msg) {
    if (enableDebug) log.debug(msg);
  }

  // =========================================================
  // Validation
  // =========================================================
  if (!callerRaw) {
    log.warn("No caller number found. Map your inbound caller-id variable to one of CALLER_NUMBER_KEYS.");
    return {
      found: false,
      reason: "missing_caller_number",
      caller_source_key: ""
    };
  }

  if (!accountId || !clientId || !clientSecret) {
    log.error("Missing OAuth credentials. Ensure zm_account_id/zm_client_id/zm_client_secret are set.");
    return {
      found: false,
      reason: "missing_credentials"
    };
  }

  if (matchMode !== "exact" && matchMode !== "ends_with" && matchMode !== "both") {
    log.warn("Invalid match_mode supplied: " + matchMode + ". Falling back to 'both'.");
    matchMode = "both";
  }

  var callerNormalized = normalizePhone(callerRaw, defaultCountryCode);
  var callerLast10 = last10(callerNormalized);
  debug("Caller source=" + callerPick.key + " raw=" + callerRaw + " normalized=" + callerNormalized);

  // =========================================================
  // Step 1: OAuth token
  // =========================================================
  var tokenUrl = "https://zoom.us/oauth/token?grant_type=account_credentials&token_index=0&account_id=" + encodeURIComponent(accountId);
  var tokenResp = await req.post(tokenUrl, {}, {
    auth: {
      username: clientId,
      password: clientSecret
    }
  });

  if (!is2xx(tokenResp.status) || !tokenResp.data || !tokenResp.data.access_token) {
    log.error("OAuth token request failed. status=" + tokenResp.status + " body=" + safeStringify(tokenResp.data));
    return {
      found: false,
      reason: "token_error",
      status: tokenResp.status
    };
  }

  var token = tokenResp.data.access_token;

  // =========================================================
  // Step 2: Enumerate Zoom Phone users and compare numbers
  // =========================================================
  var nextPageToken = "";
  var pageCount = 0;
  var scannedUsers = 0;

  do {
    pageCount += 1;
    if (pageCount > maxPages) {
      log.warn("Reached max_pages cap (" + maxPages + "). Stopping scan.");
      break;
    }

    var usersUrl = "https://api.zoom.us/v2/phone/users?page_size=300";
    if (nextPageToken) usersUrl += "&next_page_token=" + encodeURIComponent(nextPageToken);

    var usersResp = await req.get(usersUrl, {
      headers: { Authorization: "Bearer " + token }
    });

    if (!is2xx(usersResp.status)) {
      log.error("phone/users request failed. status=" + usersResp.status + " body=" + safeStringify(usersResp.data));
      return {
        found: false,
        reason: "phone_users_error",
        status: usersResp.status,
        pages_scanned: pageCount - 1
      };
    }

    var payload = usersResp.data || {};
    var users = payload.users || [];
    scannedUsers += users.length;
    debug("Scanning page=" + pageCount + " users_on_page=" + users.length);

    for (var i = 0; i < users.length; i++) {
      var u = users[i] || {};
      var numbers = u.phone_numbers || [];

      for (var j = 0; j < numbers.length; j++) {
        var numberObj = numbers[j] || {};
        var candidateRaw = numberObj.number || "";
        if (!candidateRaw) continue;

        var candidateNormalized = normalizePhone(candidateRaw, defaultCountryCode);
        var candidateLast10 = last10(candidateNormalized);

        var exactMatch = candidateNormalized === callerNormalized;
        var tailMatch = candidateLast10 && callerLast10 && candidateLast10 === callerLast10;

        var matched = false;
        var matchReason = "";

        if (matchMode === "exact") {
          matched = exactMatch;
          matchReason = exactMatch ? "exact" : "";
        } else if (matchMode === "ends_with") {
          matched = tailMatch;
          matchReason = tailMatch ? "ends_with" : "";
        } else {
          matched = exactMatch || tailMatch;
          matchReason = exactMatch ? "exact" : (tailMatch ? "ends_with" : "");
        }

        if (matched) {
          var result = {
            found: true,
            match_reason: matchReason,
            caller_source_key: callerPick.key,
            caller_input: callerRaw,
            caller_normalized: callerNormalized,
            matched_phone_number: candidateRaw,
            matched_phone_number_normalized: candidateNormalized,
            user_id: u.id || "",
            display_name: u.display_name || "",
            extension_number: u.extension_number || ""
          };

          maybeSetVar(OUTPUT_FOUND_KEY, "true");
          maybeSetVar(OUTPUT_USER_ID_KEY, result.user_id);
          maybeSetVar(OUTPUT_DISPLAY_NAME_KEY, result.display_name);
          maybeSetVar(OUTPUT_MATCHED_NUMBER_KEY, result.matched_phone_number);
          maybeSetVar(OUTPUT_MATCH_REASON_KEY, result.match_reason);

          log.info("Caller matched: " + (result.display_name || result.user_id) + " via " + result.match_reason);
          return result;
        }
      }
    }

    nextPageToken = payload.next_page_token || "";
  } while (nextPageToken);

  // =========================================================
  // No match path
  // =========================================================
  maybeSetVar(OUTPUT_FOUND_KEY, "false");

  return {
    found: false,
    reason: "no_match",
    caller_source_key: callerPick.key,
    caller_input: callerRaw,
    caller_normalized: callerNormalized,
    pages_scanned: pageCount,
    scanned_users: scannedUsers
  };
}
