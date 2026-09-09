const chatBox = document.getElementById("chatBox");
const messageInput = document.getElementById("messageInput");
const sendBtn = document.getElementById("sendBtn");

const welcome = document.getElementById("welcome");

const clearBtn = document.getElementById("clearBtn");
const newChatBtn = document.getElementById("newChatBtn");

const menuBtn = document.getElementById("menuBtn");
const sidebar = document.querySelector(".sidebar");


// Backend URL
const API_URL = window.BACKEND_URL || "http://localhost:8000/chat";


// Store conversation
let conversation = [];


// ----------------------------
// Send message
// ----------------------------

async function sendMessage(customMessage = null) {

    const text = customMessage || messageInput.value.trim();

    if (!text) {
        return;
    }


    // Hide welcome screen
    if (welcome) {
        welcome.style.display = "none";
    }


    // Clear textarea
    messageInput.value = "";

    autoResize();


    // Add user message
    addMessage(text, "user");


    // Add user message to conversation
    conversation.push({
        role: "user",
        content: text
    });


    // Disable button
    sendBtn.disabled = true;


    // Show typing indicator
    const loadingElement = addTyping();


    try {

        const response = await fetch(API_URL, {

            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                messages: conversation
            })

        });


        const data = await response.json();


        // Remove loading
        loadingElement.remove();


        if (!response.ok) {

            throw new Error(
                data.error || "Server request failed"
            );

        }


        const answer = data.reply;


        // Add response
        addMessage(answer, "assistant");


        // Save response
        conversation.push({
            role: "assistant",
            content: answer
        });


    } catch (error) {

        loadingElement.remove();


        addMessage(
            "Error: " + error.message,
            "assistant"
        );


        console.error(error);

    } finally {

        sendBtn.disabled = false;

        messageInput.focus();

    }

}


// ----------------------------
// Add message
// ----------------------------

function addMessage(text, sender) {

    const row = document.createElement("div");

    row.className = `message-row ${sender}`;


    const avatar = document.createElement("div");

    avatar.className =
        sender === "user"
            ? "avatar user-avatar"
            : "avatar ai-avatar";


    avatar.textContent =
        sender === "user"
            ? "YOU"
            : "AI";


    const message = document.createElement("div");

    message.className = "message";

    message.textContent = text;


    if (sender === "user") {

        row.appendChild(message);
        row.appendChild(avatar);

    } else {

        row.appendChild(avatar);
        row.appendChild(message);

    }


    chatBox.appendChild(row);


    scrollBottom();

}


// ----------------------------
// Typing indicator
// ----------------------------

function addTyping() {

    const row = document.createElement("div");

    row.className =
        "message-row assistant";


    const avatar = document.createElement("div");

    avatar.className =
        "avatar ai-avatar";

    avatar.textContent = "AI";


    const typing = document.createElement("div");

    typing.className = "message typing";

    typing.innerHTML = `
        <span></span>
        <span></span>
        <span></span>
    `;


    row.appendChild(avatar);

    row.appendChild(typing);


    chatBox.appendChild(row);


    scrollBottom();


    return row;

}


// ----------------------------
// Scroll
// ----------------------------

function scrollBottom() {

    chatBox.scrollTop =
        chatBox.scrollHeight;

}


// ----------------------------
// Enter key
// ----------------------------

messageInput.addEventListener(
    "keydown",
    function (event) {

        if (
            event.key === "Enter" &&
            !event.shiftKey
        ) {

            event.preventDefault();

            sendMessage();

        }

    }
);


// ----------------------------
// Send button
// ----------------------------

sendBtn.addEventListener(
    "click",
    () => sendMessage()
);


// ----------------------------
// Suggestions
// ----------------------------

document
    .querySelectorAll(".suggestion")
    .forEach(button => {

        button.addEventListener(
            "click",
            () => {

                sendMessage(
                    button.innerText
                        .replace(
                            /^[^\w]+/,
                            ""
                        )
                        .trim()
                );

            }
        );

    });


// ----------------------------
// Clear conversation
// ----------------------------

function clearConversation() {

    conversation = [];


    const messages =
        document.querySelectorAll(
            ".message-row"
        );


    messages.forEach(
        message => message.remove()
    );


    if (welcome) {
        welcome.style.display = "block";
    }


    messageInput.value = "";

    messageInput.focus();

}


clearBtn.addEventListener(
    "click",
    clearConversation
);


newChatBtn.addEventListener(
    "click",
    clearConversation
);


// ----------------------------
// Sidebar mobile
// ----------------------------

menuBtn.addEventListener(
    "click",
    () => {

        sidebar.classList.toggle("open");

    }
);


// ----------------------------
// Auto resize textarea
// ----------------------------

function autoResize() {

    messageInput.style.height = "auto";

    messageInput.style.height =
        Math.min(
            messageInput.scrollHeight,
            150
        ) + "px";

}


messageInput.addEventListener(
    "input",
    autoResize
);