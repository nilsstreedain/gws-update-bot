function main() {
  // Get last posted link
  var lastPostedLink = PropertiesService.getScriptProperties().getProperty('lastPostedLink');

  // Get RSS entries
  var feed = UrlFetchApp.fetch("http://workspaceupdates.googleblog.com/feeds/posts/default");
  var ns = XmlService.getNamespace('http://www.w3.org/2005/Atom');
  var entries = XmlService.parse(feed.getContentText()).getRootElement().getChildren('entry', ns);
  
  var links = [];

  entries.some(entry => 
    entry.getChildren('link', ns).some(element => 
      element.getAttribute('rel')?.getValue() === 'alternate' &&
      (links.push({
        link: element.getAttribute('href').getValue(),
        title: entry.getChild('title', ns).getText()
      }),
      element.getAttribute('href').getValue() === lastPostedLink)
    )
  );

  // Remove last posted link and reverse the order of the remaining links
  postLinks(links.slice(0, -1).reverse());
}

function postLinks(links) {
  // Get the saved identifier and password properties from the script properties
  const identifier = PropertiesService.getScriptProperties().getProperty('identifier');
  const password = PropertiesService.getScriptProperties().getProperty('password');
  
  if (!identifier || !password) {
    Logger.log('Error: Identifier or password not found in script properties.');
    return;
  }

  const DID = resolveDid(identifier);
  const apiKey = getApiKey(DID, password);
  
  links.forEach(linkData => {
    postToBluesky(apiKey, DID, linkData);
  });

  // After successfully posting all links, update the last posted link to the last one posted
  if (links.length > 0) {
    var newLastPostedLink = links[links.length - 1].link;  // Get the last posted link
    PropertiesService.getScriptProperties().setProperty('lastPostedLink', newLastPostedLink);
  }
}

function resolveDid(identifier) {
  const DID_URL = 'https://bsky.social/xrpc/com.atproto.identity.resolveHandle';
  const response = UrlFetchApp.fetch(DID_URL + '?handle=' + encodeURIComponent(identifier));
  const jsonResponse = JSON.parse(response.getContentText());
  return jsonResponse.did;
}

function getApiKey(DID, password) {
  const API_KEY_URL = 'https://bsky.social/xrpc/com.atproto.server.createSession';
  const payload = {
    identifier: DID,
    password: password
  };
  
  const options = {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload)
  };
  
  const response = UrlFetchApp.fetch(API_KEY_URL, options);
  const jsonResponse = JSON.parse(response.getContentText());
  return jsonResponse.accessJwt;
}

function postToBluesky(apiKey, DID, linkData) {
  const POST_FEED_URL = 'https://bsky.social/xrpc/com.atproto.repo.createRecord';
  
  // Modify the URL to replace 'http://' with 'https://'
  const link = linkData.link.replace(/^http:\/\//, 'https://');
  const title = linkData.title;
  
  // Generate rich text facets for the title (as a clickable link)
  const facets = generateLinkFacet(link, title);

  const postRecord = {
    collection: 'app.bsky.feed.post',
    repo: DID,
    record: {
      text: title,  // Only the title of the article, no link repetition
      createdAt: new Date().toISOString(),
      $type: 'app.bsky.feed.post',
      facets: facets
    }
  };

  const options = {
    method: 'post',
    contentType: 'application/json',
    headers: {
      'Authorization': 'Bearer ' + apiKey
    },
    payload: JSON.stringify(postRecord)
  };
  
  UrlFetchApp.fetch(POST_FEED_URL, options);
}

// Function to generate a single facet for the clickable link
function generateLinkFacet(link, title) {
  const facets = [];
  
  // The entire content of the post is the title as a clickable link
  const start = 0;
  const end = title.length;

  // Create a single facet for the title as a clickable link
  const facet = {
    index: {
      byteStart: start,
      byteEnd: end
    },
    features: [{
      $type: 'app.bsky.richtext.facet#link',
      uri: link
    }]
  };

  facets.push(facet);
  
  return facets;
}
