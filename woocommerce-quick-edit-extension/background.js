// Background script to handle API requests and bypass CORS
console.log("WooCommerce Quick Edit extension background script loaded.");

const SERPER_API_KEY = "2779d3b77de0f2b5d966b323fed4b8cb7da99cf3";

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === "searchImages") {
        const query = request.query;

        const myHeaders = new Headers();
        myHeaders.append("X-API-KEY", SERPER_API_KEY);
        myHeaders.append("Content-Type", "application/json");

        const raw = JSON.stringify({
          "q": query
        });

        const requestOptions = {
          method: 'POST',
          headers: myHeaders,
          body: raw,
          redirect: 'follow'
        };

        fetch("https://google.serper.dev/images", requestOptions)
          .then(response => response.json())
          .then(result => {
              // Return the first 9 image results
              const images = result.images ? result.images.slice(0, 9) : [];
              sendResponse({ success: true, images: images });
          })
          .catch(error => {
              console.error('Error fetching images:', error);
              sendResponse({ success: false, error: error.message });
          });

        return true; // indicates asynchronous response
    } else if (request.action === "downloadImage") {
        // We need to fetch the image and return it as a blob/base64 to bypass CORS
        fetch(request.url)
            .then(response => response.blob())
            .then(blob => {
                const reader = new FileReader();
                reader.onloadend = () => {
                    sendResponse({ success: true, dataUrl: reader.result });
                };
                reader.readAsDataURL(blob);
            })
            .catch(error => {
                console.error('Error downloading image:', error);
                sendResponse({ success: false, error: error.message });
            });

        return true; // indicates asynchronous response
    }
});