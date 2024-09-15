document.addEventListener('DOMContentLoaded', async function () {
    console.log("DOM fully loaded and parsed");

    let provider;
    let signer;
    let contract;

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
        },
        {
            "inputs": [
                {"internalType": "address", "name": "_reporter", "type": "address"}
            ],
            "name": "getReporterLastTimestamp",
            "outputs": [
                {"internalType": "uint256", "name": "", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [],
            "name": "getReportingLock",
            "outputs": [
                {"internalType": "uint256", "name": "", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        },
        {
            "inputs": [
                {"internalType": "bytes32", "name": "_queryId", "type": "bytes32"},
                {"internalType": "uint256", "name": "_index", "type": "uint256"}
            ],
            "name": "getReportTimestamp",
            "outputs": [
                {"internalType": "uint256", "name": "", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        }
    ];

    let lastTransactionTimestamp = null;
    let loading = false;
    let noMoreData = false;  // Prevents further fetching if no more data
    let validTransactionsCount = 0;  // Counter for valid StringQuery transactions
    const validTransactionLimit = 100; // Min valid StringQuery transactions to fetch before stopping

    function displayStatusMessage(message, isError = false) {
        const statusMessage = document.getElementById('statusMessage');
        statusMessage.textContent = message;
        statusMessage.style.color = isError ? 'red' : 'green';
        statusMessage.style.display = 'block';
        console.log(`Status Message: ${message}`);
    }

    async function connectWallet() {
        console.log("Connect Wallet button clicked.");
        try {
            provider = new ethers.providers.Web3Provider(window.ethereum);
            await provider.send("eth_requestAccounts", []);
            signer = provider.getSigner();
            console.log("Wallet connected, signer:", signer);

            const address = await signer.getAddress();
            console.log("Connected wallet address:", address);

            displayStatusMessage('Wallet connected.');
            
            // Enable the publish button after wallet connection
            const publishButton = document.getElementById('publishStory');
            publishButton.disabled = false;
            console.log("Publish button enabled:", !publishButton.disabled);
        } catch (e) {
            console.error("Error connecting wallet:", e);
            displayStatusMessage('Could not connect to wallet: ' + e.message, true);
        }
    }

    async function loadNewsFeed() {
        console.log("loadNewsFeed called. Current state:", { loading, noMoreData, validTransactionsCount });
        if (loading) {
            console.log("Already loading, skipping this call");
            return;
        }
        if (noMoreData) {
            console.log("No more data flag is set, stopping further requests");
            return;
        }
        if (validTransactionsCount >= validTransactionLimit) {
            console.log(`Reached valid transaction limit (${validTransactionLimit}), stopping further requests`);
            return;
        }

        loading = true;
        console.log("Setting loading to true");

        let apiUrl = `https://api.scan.pulsechain.com/api/v2/addresses/${contractAddress}/transactions?filter=to&limit=100`;

        if (lastTransactionTimestamp) {
            apiUrl += `&toTimestamp=${lastTransactionTimestamp}`;
            console.log("Appending timestamp filter:", lastTransactionTimestamp);
        } else {
            console.log("First page of data, no timestamp filter needed.");
        }

        try {
            console.log("Fetching data from API:", apiUrl);
            const response = await fetch(apiUrl);

            if (!response.ok) {
                console.error("Error fetching data, status:", response.status);
                throw new Error(`API Error: ${response.statusText}`);
            }

            const data = await response.json();
            console.log("Data fetched from API:", data);

            if (data.items.length === 0) {
                console.log("No items returned from API");
                noMoreData = true;
                displayStatusMessage("No more news stories available.");
                return;
            }

            let newValidTransactions = 0;

            for (let tx of data.items) {
                console.log("Processing transaction:", tx.hash);

                if (tx.method === 'submitValue') {
                    let decodedParams = tx.decoded_input ? tx.decoded_input.parameters : null;

                    if (decodedParams && decodedParams.length >= 4) {
                        console.log("Found decoded parameters for transaction:", tx.hash);
                        const queryDataParam = decodedParams[3].value;

                        try {
                            let decodedQueryData = ethers.utils.defaultAbiCoder.decode(['string', 'bytes'], queryDataParam);
                            console.log("Decoded query data for transaction:", tx.hash, decodedQueryData);

                            const queryType = decodedQueryData[0];
                            const reportContentBytes = decodedQueryData[1];

                            if (queryType === "StringQuery") {
                                console.log("StringQuery found in transaction:", tx.hash);

                                let reportContent = '';

                                try {
                                    reportContent = ethers.utils.toUtf8String(reportContentBytes);
                                    console.log("Decoded report content (UTF-8):", reportContent);
                                } catch (utf8Error) {
                                    console.warn("Error decoding report content as UTF-8 string:", utf8Error);
                                    reportContent = "<Invalid or non-readable content>";
                                }

                                const newsFeed = document.getElementById('newsFeed');
                                const article = document.createElement('article');
                                article.innerHTML = `<p>${reportContent}</p>`;
                                newsFeed.appendChild(article);

                                newValidTransactions++;
                                validTransactionsCount++;
                                console.log(`Valid transaction processed. Total: ${validTransactionsCount}`);
                            } else {
                                console.log("Transaction is not a StringQuery:", tx.hash);
                            }
                        } catch (error) {
                            console.error("Error decoding parameters for transaction:", tx.hash, error);
                        }
                    }
                } else {
                    console.log("Transaction method not 'submitValue', skipping:", tx.hash);
                }
            }

            if (data.items.length > 0) {
                lastTransactionTimestamp = data.items[data.items.length - 1].timestamp;
                console.log("Updated lastTransactionTimestamp to:", lastTransactionTimestamp);
            }

            console.log(`Processed ${data.items.length} transactions, found ${newValidTransactions} new valid transactions`);

            if (newValidTransactions === 0) {
                console.log("No new valid transactions found in this batch");
            }

            // Always try to fetch more data if we haven't reached the limit
            if (validTransactionsCount < validTransactionLimit) {
                console.log(`Fetched ${validTransactionsCount} valid StringQuery transactions, fetching more...`);
                setTimeout(() => loadNewsFeed(), 1000);  // Add a slight delay before the next fetch
            } else {
                console.log(`Reached ${validTransactionLimit} valid transactions, stopping further requests`);
                displayStatusMessage("News feed fully loaded.");
            }

        } catch (error) {
            console.error("Error loading news feed:", error);
            displayStatusMessage('Error loading news feed: ' + error.message, true);
        } finally {
            loading = false;
            console.log("News feed loading complete. loading set to:", loading);
        }
    }

    async function submitStory() {
        console.log("Submit Story function called");
        const publishButton = document.getElementById('publishStory');
        const reportContentElement = document.getElementById('reportContent');
        const reportContent = reportContentElement.value.trim();

        console.log("Current report content:", reportContent);
        console.log("Publish button state before submission:", publishButton.disabled ? "disabled" : "enabled");

        if (!reportContent) {
            console.log("Empty report content, aborting submission");
            displayStatusMessage('Please enter a story before submitting.', true);
            return;
        }

        publishButton.disabled = true;
        console.log("Publish button disabled for submission");
        displayStatusMessage('Submitting story...', false);

        try {
            if (!signer) {
                throw new Error("Wallet not connected. Please connect your wallet first.");
            }

            console.log("Checking if reporter is locked...");
            const isUnlocked = await checkIfReporterLocked();
            console.log("Reporter lock status:", isUnlocked ? "unlocked" : "locked");

            if (!isUnlocked) {
                throw new Error('Reporter is still locked. Please wait until unlocked.');
            }

            contract = new ethers.Contract(contractAddress, contractABI, signer);

            const queryData = ethers.utils.defaultAbiCoder.encode(['string', 'bytes'], ["StringQuery", ethers.utils.toUtf8Bytes(reportContent)]);
            const queryId = ethers.utils.keccak256(queryData);
            console.log("Generated query ID:", queryId);

            const nonce = await contract.getNewValueCountbyQueryId(queryId);
            console.log("Current nonce:", nonce);

            const value = ethers.utils.defaultAbiCoder.encode(['string', 'bytes'], ["NEWS", ethers.utils.toUtf8Bytes(reportContent)]);
            console.log("Encoded value:", value);

            const gasEstimate = await contract.estimateGas.submitValue(queryId, value, nonce, queryData);
            console.log("Estimated gas for submitValue:", gasEstimate.toString());

            const tx = await contract.submitValue(queryId, value, nonce, queryData, { gasLimit: gasEstimate.mul(120).div(100) }); // Add 20% to the gas estimate
            console.log("Transaction submitted, waiting for confirmation...", tx.hash);

            displayStatusMessage("Transaction submitted. Waiting for confirmation...", false);

            const receipt = await tx.wait();
            console.log("Transaction confirmed:", receipt.transactionHash);

            console.log("Story submitted successfully");
            displayStatusMessage("Story successfully submitted!");
            reportContentElement.value = ''; // Clear the input field
            loadNewsFeed(); // Refresh the news feed
        } catch (error) {
            console.error("Error submitting story:", error);
            displayStatusMessage('Error submitting story: ' + error.message, true);
        } finally {
            publishButton.disabled = false;
            console.log("Publish button re-enabled");
        }
    }

    async function checkIfReporterLocked() {
        console.log("Checking if reporter is locked...");
        try {
            contract = new ethers.Contract(contractAddress, contractABI, provider);
            const lockTime = await contract.getReportingLock();
            console.log("Reporter lock duration (in seconds):", lockTime.toString());

            const address = await signer.getAddress();
            console.log("Checking lock for address:", address);
            const lastTimestamp = await contract.getReporterLastTimestamp(address);
            console.log("Last reporting timestamp:", lastTimestamp.toString());

            const currentTime = Math.floor(Date.now() / 1000);
            const unlockTime = Number(lastTimestamp) + Number(lockTime);

            console.log("Current time:", currentTime);
            console.log("Unlock time:", unlockTime);

            if (currentTime < unlockTime) {
                const remainingTime = unlockTime - currentTime;
                console.log("Reporter is still locked. Time left (seconds):", remainingTime);
                return false;
            }

            console.log("Reporter is not locked.");
            return true;

        } catch (error) {
            console.error("Error checking if reporter is locked:", error);
            displayStatusMessage('Error checking lock status: ' + error.message, true);
            return false;
        }
    }

    window.addEventListener('scroll', () => {
        console.log('Scroll event detected:', window.scrollY, 'Window height:', window.innerHeight, 'Document height:', document.body.offsetHeight);
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 && !loading && !noMoreData) {
            console.log("Triggering news feed load on scroll.");
            loadNewsFeed();
        }
    });

    const connectWalletButton = document.getElementById('connectWallet');
    const publishButton = document.getElementById('publishStory');

    if (connectWalletButton) {
        connectWalletButton.addEventListener('click', connectWallet);
        console.log("Connect Wallet button event listener added");
    } else {
        console.error("Connect Wallet button not found in the DOM");
    }

    if (publishButton) {
        publishButton.addEventListener('click', submitStory);
        console.log("Publish Story button event listener added");
    } else {
        console.error("Publish Story button not found in the DOM");
    }

    // Initial setup
    if (publishButton) {
        publishButton.disabled = true; // Disable the button initially
        console.log("Publish button initial state:", publishButton.disabled ? "disabled" : "enabled");
    }

    // Initial load of the news feed
    loadNewsFeed();

    // Add a button to manually reload the news feed
    const reloadButton = document.createElement('button');
    reloadButton.textContent = 'Reload News Feed';
    reloadButton.addEventListener('click', () => {
        console.log("Manual reload of news feed triggered");
        lastTransactionTimestamp = null;
        validTransactionsCount = 0;
        noMoreData = false;
        loadNewsFeed();
    });
    document.body.appendChild(reloadButton);
});
