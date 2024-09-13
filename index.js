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

    let lastTransactionBlock = null;  // To track the block number for pagination
    let loading = false;
    let noMoreData = false;  // Prevents further fetching if no more data
    let seenBlocks = new Set();  // To ensure we don't process the same block twice

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

            displayStatusMessage('Wallet connected.');
        } catch (e) {
            displayStatusMessage('Could not connect to wallet: ' + e.message, true);
        }
    }

    async function loadNewsFeed() {
        if (loading || noMoreData) return;  // Prevents multiple simultaneous calls
        loading = true;
        console.log("loadNewsFeed called. loading:", loading, "noMoreData:", noMoreData);

        let apiUrl = `https://api.scan.pulsechain.com/api/v2/addresses/0xD9157453E2668B2fc45b7A803D3FEF3642430cC0/transactions?filter=to%20%7C%20from&limit=100`;

        if (lastTransactionBlock) {
            apiUrl += `&beforeBlock=${lastTransactionBlock}`;
            console.log("Appending block filter:", lastTransactionBlock);
        } else {
            console.log("First page of data, no block filter needed.");
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

            let foundValidTransaction = false;

            if (data.items.length === 0) {
                noMoreData = true;  // Set flag if no more data is available
                displayStatusMessage("No more news stories available.", true);
                console.log("No more transactions to load, stopping further requests.");
                loading = false;
                return;
            }

            for (let tx of data.items) {
                // Avoid displaying already seen blocks
                if (seenBlocks.has(tx.block)) continue;

                console.log("Checking transaction:", tx);
                let decodedParams = tx.decoded_input ? tx.decoded_input.parameters : null;

                if (decodedParams && decodedParams.length >= 4) {
                    const queryType = decodedParams[0].value;  // Fetch query type
                    if (queryType === "StringQuery") {  // We only care about "StringQuery" types
                        console.log("Found decoded parameters:", decodedParams);

                        try {
                            const queryDataParam = decodedParams[3].value;
                            console.log("Raw queryDataParam:", queryDataParam);

                            let decodedQueryData = ethers.utils.defaultAbiCoder.decode(['string', 'bytes'], queryDataParam);
                            console.log("Decoded query data:", decodedQueryData);

                            const reportContentBytes = decodedQueryData[1];
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

                            foundValidTransaction = true;
                        } catch (error) {
                            console.error("Error decoding parameters:", error);
                        }
                    }
                }

                seenBlocks.add(tx.block);  // Mark the block as processed
            }

            if (data.items.length > 0) {
                lastTransactionBlock = data.items[data.items.length - 1].block;  // Track last block for pagination
                console.log("Updated lastTransactionBlock to:", lastTransactionBlock);
            }

            if (!foundValidTransaction) {
                displayStatusMessage("No valid news stories found.", true);
            }

        } catch (error) {
            console.error("Error loading news feed:", error);
            displayStatusMessage('Error loading news feed: ' + error.message, true);
        } finally {
            loading = false;
            console.log("News feed loading complete. loading set to:", loading);
        }
    }

    async function checkIfReporterLocked() {
        console.log("Checking if reporter is locked...");

        try {
            contract = new ethers.Contract(contractAddress, contractABI, signer);
            const reporterAddress = await signer.getAddress();

            const lastReportTimestamp = await contract.getReporterLastTimestamp(reporterAddress);
            const reportingLock = await contract.getReportingLock();
            const currentTime = Math.floor(Date.now() / 1000);

            const timeSinceLastReport = currentTime - lastReportTimestamp;

            if (timeSinceLastReport < reportingLock) {
                const remainingLockTime = reportingLock - timeSinceLastReport;
                const hours = Math.floor(remainingLockTime / 3600);
                const minutes = Math.floor((remainingLockTime % 3600) / 60);
                const seconds = remainingLockTime % 60;

                console.log(`Reporter is locked. Time left: ${hours}h ${minutes}m ${seconds}s`);
                alert(`Reporter is locked. Time left: ${hours}h ${minutes}m ${seconds}s`);
                return false;
            } else {
                console.log('Reporter is unlocked.');
                return true;
            }
        } catch (error) {
            console.error('Error checking reporter lock status:', error);
            return false;
        }
    }

    async function submitStory() {
        console.log("Submitting story...");
        const reportContent = document.getElementById('reportContent').value;
        console.log("Report content to be submitted:", reportContent);

        if (!signer) {
            console.error("Wallet not connected. Cannot submit story.");
            displayStatusMessage('Wallet not connected. Please connect your wallet first.', true);
            return;
        }

        const isUnlocked = await checkIfReporterLocked();
        if (!isUnlocked) {
            displayStatusMessage('Reporter is still locked. Please wait until unlocked.', true);
            return;
        }

        try {
            contract = new ethers.Contract(contractAddress, contractABI, signer);

            const queryData = ethers.utils.defaultAbiCoder.encode(['string', 'bytes'], ["StringQuery", ethers.utils.toUtf8Bytes(reportContent)]);
            const queryId = ethers.utils.keccak256(queryData);
            console.log("Generated query ID:", queryId);

            const nonce = await contract.getNewValueCountbyQueryId(queryId);
            console.log("Current nonce:", nonce);

            const value = ethers.utils.defaultAbiCoder.encode(['string', 'bytes'], ["NEWS", ethers.utils.toUtf8Bytes(reportContent)]);
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

    window.addEventListener('scroll', () => {
        console.log('Scroll event detected:', window.scrollY, 'Window height:', window.innerHeight, 'Document height:', document.body.offsetHeight);
        if ((window.innerHeight + window.scrollY) >= document.body.offsetHeight - 500 && !loading) {
            console.log("Triggering news feed load on scroll.");
            loadNewsFeed();
        }
    });

    document.getElementById('connectWallet').addEventListener('click', connectWallet);
    document.getElementById('publishStory').addEventListener('click', submitStory);

    // Initial load of the news feed
    loadNewsFeed();
});
