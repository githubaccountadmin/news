document.addEventListener('DOMContentLoaded', async function() {
    console.log("DOM fully loaded and parsed");

    let provider;
    let signer;
    let contract;
    let currentPage = 1;  // Page counter for pagination
    let isLoading = false;  // Flag to prevent multiple simultaneous loads
    let noMoreTransactions = false;  // Flag to stop fetching when no more data is available

    function displayStatusMessage(message, isError = false) {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? 'red' : 'green';
        statusMessage.style.display = 'block';
    }

    async function connectWallet() {
        console.log("Connect Wallet button clicked.");
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            console.log("Wallet connected, signer:", signer);

            localStorage.setItem('walletConnected', 'true');
            displayStatusMessage('Wallet connected.');
        } catch (e) {
            displayStatusMessage('Could not connect to wallet: ' + e.message, true);
        }
    }

    function checkWalletConnection() {
        const walletConnected = localStorage.getItem('walletConnected');
        if (walletConnected === 'true') {
            connectWallet();
        }
    }

    checkWalletConnection();

    async function loadNewsFeed() {
        if (isLoading || noMoreTransactions) return; // Prevents loading if already loading or no more transactions are available

        isLoading = true;
        console.log("Loading news feed, page:", currentPage);

        const apiUrl = `https://api.scan.pulsechain.com/api/v2/addresses/0xD9157453E2668B2fc45b7A803D3FEF3642430cC0/transactions?filter=to%20%7C%20from&page=${currentPage}`;

        try {
            console.log("Fetching data from API:", apiUrl);
            const response = await fetch(apiUrl);

            if (!response.ok) {
                console.error("Error fetching data, status:", response.status);
                throw new Error(`API Error: ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Data fetched from API:", data);

            let foundValidTransaction = false;

            for (let tx of data.items) {
                console.log("Checking transaction:", tx);

                let decodedParams = tx.decoded_input ? tx.decoded_input.parameters : null;

                if (decodedParams && decodedParams.length >= 4) {
                    console.log("Found decoded parameters:", decodedParams);

                    try {
                        const queryDataParam = decodedParams[3].value;

                        // Decode the query data
                        let decodedQueryData = ethers.utils.defaultAbiCoder.decode(['string', 'bytes'], queryDataParam);
                        console.log("Decoded _queryData:", decodedQueryData);

                        // Process both StringQuery and SpotPrice
                        const queryType = decodedQueryData[0];
                        if (queryType === "StringQuery" || queryType === "SpotPrice") {
                            // Decode the string content from the bytes
                            const decodedString = ethers.utils.toUtf8String(decodedQueryData[1]);
                            console.log(`Decoded ${queryType} data:`, decodedString);

                            const newsFeed = document.getElementById('newsFeed');
                            const article = document.createElement('article');
                            article.innerHTML = `
                                <h3>${queryType}</h3>
                                <p>${decodedString}</p>
                            `;
                            newsFeed.appendChild(article);

                            foundValidTransaction = true;
                        }
                    } catch (error) {
                        console.error("Error decoding parameters:", error);
                    }
                } else {
                    console.log("Transaction has no or insufficient decoded input data:", tx);
                }
            }

            if (!foundValidTransaction && data.items.length === 0) {
                noMoreTransactions = true; // No more transactions to load
                displayStatusMessage("No more transactions to load.", true);
            } else if (!foundValidTransaction) {
                currentPage++; // Load the next page
                loadNewsFeed(); // Automatically load the next batch
            }

        } catch (error) {
            console.error("Error loading news feed:", error);
            displayStatusMessage('Error loading news feed: ' + error.message, true);
        } finally {
            isLoading = false;
        }
    }

    async function submitStory() {
        console.log("Submitting story...");
        const title = document.getElementById('title').value;
        const summary = document.getElementById('summary').value;
        const fullArticle = document.getElementById('fullArticle').value;
        const newsContent = `Title: ${title}\nSummary: ${summary}\nFull Article: ${fullArticle}`;
        console.log("News content to be submitted:", newsContent);

        if (!signer) {
            console.error("Wallet not connected. Cannot submit story.");
            return;
        }

        const contractAddress = '0xD9157453E2668B2fc45b7A803D3FEF3642430cC0';
        const contractABI = [
            {
                "inputs": [
                    {"internalType": "bytes32", "name": "_queryId", "type": "bytes32"},
                    {"internalType": "bytes", "name": "_value", "type": "bytes"},
                    {"internalType": "uint256", "name": "_nonce", "type": "uint256"},
                    {"internalType": "bytes", "name": "_queryData", "type": "bytes"}
                ],
                "name": "submitValue",
                "outputs": [],
                "stateMutability": "nonpayable",
                "type": "function"
            },
            {
                "inputs": [
                    {"internalType": "bytes32", "name": "_queryId", "type": "bytes32"}
                ],
                "name": "getNewValueCountbyQueryId",
                "outputs": [
                    {"internalType": "uint256", "name": "", "type": "uint256"}
                ],
                "stateMutability": "view",
                "type": "function"
            }
        ];

        try {
            contract = new ethers.Contract(contractAddress, contractABI, signer);

            const queryData = ethers.utils.defaultAbiCoder.encode(['string', 'bytes'], ["StringQuery", ethers.utils.toUtf8Bytes(newsContent)]);
            const queryId = ethers.utils.keccak256(queryData);
            console.log("Generated query ID:", queryId);

            const nonce = await contract.getNewValueCountbyQueryId(queryId);
            console.log("Current nonce:", nonce);

            const value = ethers.utils.defaultAbiCoder.encode(['string', 'bytes'], ["NEWS", ethers.utils.toUtf8Bytes(newsContent)]);
            console.log("Encoded value:", value);

            const gasEstimate = await contract.estimateGas.submitValue(queryId, value, nonce, queryData);
            console.log("Estimated gas:", gasEstimate.toString());

            try {
                const tx = await contract.submitValue(queryId, value, nonce, queryData, { gasLimit: gasEstimate.add(100000) });
                displayStatusMessage(`Transaction submitted successfully! Hash: ${tx.hash}`);
            } catch (error) {
                console.error("Error submitting story:", error);
                displayStatusMessage('Error submitting story: ' + error.message, true);
            }

        } catch (error) {
            console.error("Error during story submission process:", error);
            displayStatusMessage('Error during story submission process: ' + error.message, true);
        }
    }

    function detectScrollForMore() {
        window.addEventListener('scroll', () => {
            if (window.innerHeight + window.scrollY >= document.body.offsetHeight - 100) {
                loadNewsFeed(); // Automatically load more content when near the bottom
            }
        });
    }

    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    console.log("Event listener added to Connect Wallet button.");

    document.getElementById('publishStory').addEventListener('click', submitStory);
    console.log("Event listener added to Publish Story button.");

    detectScrollForMore();  // Initialize scroll detection
    loadNewsFeed();  // Initial load
});
