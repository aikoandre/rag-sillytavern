# SillyTavern RAG Extension

This extension provides a powerful, local-first Retrieval-Augmented Generation (RAG) system for SillyTavern. It uses a Python backend with a two-stage reranking process to find the most relevant memories and inject them into the context.

## Features

-   **Local First:** All models (embedding and rerankers) run locally on your machine.
-   **Persistent Memory:** Embeddings and metadata are saved to disk (`faiss.index` and `metadata.json`).
-   **Two-Stage Reranking:** A fast reranker filters a large number of candidates, and a more powerful (but slower) reranker selects the final, most relevant memories.
-   **Simple UI:** A settings panel in SillyTavern to add and query memories.

## How It Works

1.  **Python Service:** A Flask-based web service (`rag_faiss_service.py`) handles all the heavy lifting.
    -   It automatically downloads and caches the necessary models from Hugging Face Hub.
    -   It exposes `/add` and `/query` endpoints.
2.  **SillyTavern Extension:** The JavaScript extension communicates with the Python service.
    -   It provides a UI for interacting with the RAG system.
    -   (Future Work): It will automatically add messages to the memory and inject query results into the prompt.

## Setup and Installation

### Step 1: Python Environment Setup

The backend service requires a specific Python environment. We recommend using Conda.

1.  **Install Conda:** If you don't have it, install [Miniconda](https://docs.conda.io/projects/miniconda/en/latest/) or [Anaconda](https://www.anaconda.com/products/distribution).

2.  **Create and Activate Conda Environment:**
    Open your terminal and run the following commands to create a new environment named `ST` and install the required packages.

    ```bash
    # Create the environment
    conda create --name ST python=3.10 -y

    # Activate the environment
    conda activate ST

    # Install required Python packages
    pip install flask sentence-transformers faiss-cpu numpy huggingface_hub
    ```

### Step 2: Running the RAG Service

Before using the extension in SillyTavern, you must start the Python backend service.

1.  **Open a new terminal** in the root directory of this project.
2.  **Activate the conda environment:**
    ```bash
    conda activate ST
    ```
3.  **Run the service script:**
    You can run the service directly or use the provided shell script.

    **Using the script (recommended for Linux/macOS):**
    ```bash
    # Make the script executable (only needs to be done once)
    chmod +x run_rag_service.sh

    # Run the service
    ./run_rag_service.sh
    ```

    **Running directly (for Windows or if the script fails):**
    ```bash
    python rag_faiss_service.py
    ```

4.  **First-time Model Download:** The first time you run the service, it will download several GB of models from Hugging Face. This may take some time. You will see progress bars in the terminal.

5.  **Keep it running:** Leave this terminal window open. The service must be running in the background for the extension to work.

### Step 3: Installing the Extension in SillyTavern

1.  **GitHub Repository:** This project needs to be in a GitHub repository. The user will use the link to this repository to install it.
2.  **SillyTavern Installation:**
    -   Go to the "Extensions" tab in SillyTavern.
    -   Under "Download Extension", paste the URL of the GitHub repository.
    -   Click "Download".
    -   Enable the "RAG Extension" in the extensions list.

## How to Use

1.  **Start the RAG Service:** Make sure the Python service is running (see Step 2 above).
2.  **Open SillyTavern:** Navigate to the extensions settings panel for the RAG extension.
3.  **Check Status:** The "Service Status" indicator should be green. If it's red, the service is not running or is unreachable.
4.  **Add Memories:** Type text into the "Add Memory" box and click the button. This will embed the text and save it.
5.  **Query Memories:** Type a query into the "Query Memories" box and click "Query". The top 10 most relevant results from the two-stage reranking process will be displayed.