javascript:(function () {
  var d = new Date().toISOString().split('T')[0];
  var dateParam =
    'date=' + d + '_' + d + '%2Ctoday' +
    '&comparison_date=' +
    '&insights_date=' + d + '_' + d + '%2Ctoday';
  var p = [
    'columns=name,delivery,budget,impressions,cpm,spend,' + 'actions:link_click,cost_per_action_type:link_click,website_ctr:link_click,' + 'actions:lead,cost_per_action_type:lead,' + 'actions:omni_complete_registration,cost_per_action_type:omni_complete_registration,' + 'results,cost_per_result', 'locale=ru_RU', dateParam].join('&');
  var u = new URL(location.href);
  var a = u.searchParams.get('act');
  var b = u.searchParams.get('business_id');
  if (!a) {
    var url = location.href.replace(/#$/, '');
    location.href = url + (url.indexOf('?') > -1 ? '&' : '?') + 'locale=ru_RU';
    return;
  }

  var newUrl = 'https://adsmanager.facebook.com/adsmanager/manage/ads?act=' +
    encodeURIComponent(a);
  if (b) {
    newUrl += '&business_id=' + encodeURIComponent(b);
  }
  var sc = u.searchParams.get('selected_campaign_ids');
  if (sc) {
    newUrl += '&selected_campaign_ids=' + encodeURIComponent(sc);
  }
  var sa = u.searchParams.get('selected_adset_ids');
  if (sa) {
    newUrl += '&selected_adset_ids=' + encodeURIComponent(sa);
  }

  var sd = u.searchParams.get('selected_ad_ids');
  if (sd) {
    newUrl += '&selected_ad_ids=' + encodeURIComponent(sd);
  }
  newUrl += '&' + p;
  location.href = newUrl;
})();
