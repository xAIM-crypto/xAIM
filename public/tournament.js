// Function to create connectors with end vertical lines
function createConnectors(matchDiv, round, matchIndex) {
    // Create connector container if not exists
    let connectorContainer = document.querySelector('.connector-container');
    if (!connectorContainer) {
        connectorContainer = document.createElement('div');
        connectorContainer.className = 'connector-container';
        tournamentBracket.appendChild(connectorContainer);
    }

    // Create connectors for all matches except final round
    if (round < 4) {
        // Create horizontal connector from current match
        const horizontalConnector = document.createElement('div');
        horizontalConnector.className = 'match-connector';
        connectorContainer.appendChild(horizontalConnector);

        // Create vertical connector for current match
        const verticalConnector = document.createElement('div');
        verticalConnector.className = 'vertical-connector';
        connectorContainer.appendChild(verticalConnector);

        // Position connectors
        setTimeout(() => {
            const matchRect = matchDiv.getBoundingClientRect();
            const bracketRect = tournamentBracket.getBoundingClientRect();
            
            // Find next match
            const nextMatchIndex = Math.floor(matchIndex / 2);
            const nextRound = round + 1;
            const nextMatch = document.querySelector(`.round[data-round="${nextRound}"] .match[data-match-id="${nextRound}-${nextMatchIndex}"]`);
            
            if (nextMatch) {
                const nextMatchRect = nextMatch.getBoundingClientRect();
                
                // Position horizontal connector - extend exactly to the vertical line
                horizontalConnector.style.left = `${matchRect.right - bracketRect.left}px`;
                horizontalConnector.style.top = `${matchRect.top + (matchRect.height / 2) - bracketRect.top}px`;
                horizontalConnector.style.width = `${nextMatchRect.left - matchRect.right - 2}px`; // Subtract 2px for the vertical line width

                // Calculate vertical connector position
                const isEven = matchIndex % 2 === 0;
                const verticalStart = matchRect.top + (matchRect.height / 2) - bracketRect.top;
                const verticalEnd = nextMatchRect.top + (nextMatchRect.height / 2) - bracketRect.top;
                
                // Position vertical connector
                verticalConnector.style.left = `${nextMatchRect.left - bracketRect.left - 2}px`; // Align with horizontal connector
                if (isEven) {
                    // Even numbered match - connect down to next match
                    const oddMatch = document.querySelector(`.round[data-round="${round}"] .match[data-match-id="${round}-${matchIndex + 1}"]`);
                    if (oddMatch) {
                        const oddMatchRect = oddMatch.getBoundingClientRect();
                        const oddMatchCenter = oddMatchRect.top + oddMatchRect.height/2 - bracketRect.top;
                        verticalConnector.style.top = `${verticalStart}px`;
                        verticalConnector.style.height = `${oddMatchCenter - verticalStart}px`;
                    }
                } else {
                    // Odd numbered match - connect up to previous match
                    const evenMatch = document.querySelector(`.round[data-round="${round}"] .match[data-match-id="${round}-${matchIndex - 1}"]`);
                    if (evenMatch) {
                        const evenMatchRect = evenMatch.getBoundingClientRect();
                        const evenMatchCenter = evenMatchRect.top + evenMatchRect.height/2 - bracketRect.top;
                        verticalConnector.style.top = `${evenMatchCenter}px`;
                        verticalConnector.style.height = `${verticalStart - evenMatchCenter}px`;
                    }
                }
            }
        }, 50);
    }

    // Add connectors for 4th round matches to final round
    if (round === 3) {
        // Create horizontal connector to final
        const horizontalConnector = document.createElement('div');
        horizontalConnector.className = 'match-connector final-connector';
        connectorContainer.appendChild(horizontalConnector);

        // Create vertical connector to final
        const verticalConnector = document.createElement('div');
        verticalConnector.className = 'vertical-connector final-connector';
        connectorContainer.appendChild(verticalConnector);

        setTimeout(() => {
            const matchRect = matchDiv.getBoundingClientRect();
            const bracketRect = tournamentBracket.getBoundingClientRect();
            const finalMatch = document.querySelector(`.round[data-round="4"] .match[data-match-id="4-0"]`);
            
            if (finalMatch) {
                const finalMatchRect = finalMatch.getBoundingClientRect();
                
                // Position horizontal connector to final match - extend exactly to vertical line
                horizontalConnector.style.left = `${matchRect.right - bracketRect.left}px`;
                horizontalConnector.style.top = `${matchRect.top + (matchRect.height / 2) - bracketRect.top}px`;
                horizontalConnector.style.width = `${finalMatchRect.left - matchRect.right - 2}px`; // Subtract 2px for vertical line

                // Position vertical connector to final match - precise alignment
                verticalConnector.style.left = `${finalMatchRect.left - bracketRect.left - 2}px`;
                const verticalStart = matchRect.top + (matchRect.height / 2) - bracketRect.top;
                const verticalEnd = finalMatchRect.top + (finalMatchRect.height / 2) - bracketRect.top;
                verticalConnector.style.top = `${Math.min(verticalStart, verticalEnd)}px`;
                verticalConnector.style.height = `${Math.abs(verticalEnd - verticalStart)}px`;
            }
        }, 50);
    }
}

// Global variables
const tournamentBracket = document.querySelector('.tournament-bracket');
const modelCountElement = document.getElementById('modelCount');
const countdownElement = document.getElementById('countdown');
let tournamentModels = [];
let currentGroup = 0;
const GROUPS_COUNT = 32;
const MODELS_PER_GROUP = 32; // 1024/32 = 32 models per group

// For the ring animation
const timerProgressRing = document.querySelector('.progress-ring circle.progress');
const counterProgressRing = document.querySelector('.counter-progress-ring circle.progress');
const counterLabel = document.querySelector('.counter-label');

// Constants
const THIRTY_SIX_HOURS_MS = 36 * 60 * 60 * 1000; // 129600000 ms
// We'll store the deadline in localStorage under this key:
const DEADLINE_KEY = 'tournamentDeadline';

let countdownInterval = null;

/**
 * Calculate remaining time to the deadline
 * and update the countdown display/ring. 
 */
function updateTimer() {
  // Retrieve stored deadline from localStorage
  const storedDeadline = localStorage.getItem(DEADLINE_KEY);
  if (!storedDeadline) {
    // No deadline => no countdown started => set to 00:00:00
    countdownElement.textContent = '36:00:00';
    if (timerProgressRing) {
      timerProgressRing.style.strokeDashoffset = 2 * Math.PI * 54; // fully empty
    }
    return;
  }

  // Calculate time left in ms
  const now = Date.now();
  const deadline = parseInt(storedDeadline, 10);
  const timeLeft = deadline - now;

  if (timeLeft <= 0) {
    // Countdown ended (or passed)
    clearInterval(countdownInterval);
    countdownInterval = null;
    countdownElement.textContent = '00:00:00';
    if (timerProgressRing) {
      timerProgressRing.style.strokeDashoffset = 2 * Math.PI * 54; // fully empty
    }
    return;
  }

  // Convert ms → hh:mm:ss
  const totalSeconds = Math.floor(timeLeft / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  countdownElement.textContent = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  // Update the ring (visual progress):
  if (timerProgressRing) {
    const circumference = 2 * Math.PI * 54; // for r=54
    // fraction of the 36-hour total
    const fraction = timeLeft / THIRTY_SIX_HOURS_MS;
    const dashOffset = circumference - fraction * circumference;
    timerProgressRing.style.strokeDasharray = `${circumference} ${circumference}`;
    timerProgressRing.style.strokeDashoffset = dashOffset;
  }
}

/**
 * Only called once we confirm the modelCount === 1024.
 * If there's no existing tournamentDeadline in localStorage, 
 * set a new one: now + 36h. 
 * If deadline already exists, use it (so we never reset).
 */
function startCountdownIfNeeded() {
  const existingDeadline = localStorage.getItem(DEADLINE_KEY);
  if (!existingDeadline) {
    // Set new deadline 36h from now
    const deadline = Date.now() + THIRTY_SIX_HOURS_MS;
    localStorage.setItem(DEADLINE_KEY, deadline.toString());
  }
  // Now, make sure the interval is running
  if (!countdownInterval) {
    countdownInterval = setInterval(updateTimer, 1000);
    updateTimer(); // do an immediate update
  }
}

/**
 * Called after your server fetch updates the model count.
 * If count < total, no countdown.
 * If count === total (== 1024), call startCountdownIfNeeded().
 */
function updateModelCounter(count, total) {
  // 1) Update the displayed count
  if (modelCountElement) {
    modelCountElement.textContent = count;
  }
  // 2) Update the ring for the count
  if (counterProgressRing) {
    const circumference = 2 * Math.PI * 54; 
    const fraction = count / total;
    const dashOffset = circumference - fraction * circumference;
    counterProgressRing.style.strokeDasharray = `${circumference} ${circumference}`;
    counterProgressRing.style.strokeDashoffset = dashOffset;
  }
  if (counterLabel) {
    counterLabel.textContent = `/ ${total} models`;
  }

  // 3) If we've reached 1024, start the tournament countdown
  //    if not already started.
  if (count === total) {
    startCountdownIfNeeded();
  } else {
    // If not 1024, you can optionally stop the interval 
    // or set countdown to 0: 
    // But generally, do nothing. 
  }
}

// Create group navigation controls
function createGroupNavigation() {
    const navigationDiv = document.getElementById('groupNavigation');
    if (!navigationDiv) return;
    
    navigationDiv.innerHTML = '';
    const controlsDiv = document.createElement('div');
    controlsDiv.className = 'group-controls';
    
    const prevButton = document.createElement('button');
    prevButton.textContent = '← Previous Group';
    prevButton.onclick = () => navigateGroup(-1);
    
    const groupIndicator = document.createElement('div');
    groupIndicator.className = 'group-indicator';
    groupIndicator.id = 'groupIndicator';
    updateGroupIndicator();
    
    const nextButton = document.createElement('button');
    nextButton.textContent = 'Next Group →';
    nextButton.onclick = () => navigateGroup(1);
    
    controlsDiv.appendChild(prevButton);
    controlsDiv.appendChild(groupIndicator);
    controlsDiv.appendChild(nextButton);
    navigationDiv.appendChild(controlsDiv);
}

// Update group indicator text
function updateGroupIndicator() {
    const indicator = document.getElementById('groupIndicator');
    if (indicator) {
        // Add 1 to currentGroup for display since we want to show 1-based indexing
        indicator.textContent = `Group ${currentGroup + 1} of ${GROUPS_COUNT}`;
    }
}

// Navigate between groups
function navigateGroup(direction) {
    const newGroup = currentGroup + direction;
    if (newGroup >= 0 && newGroup < GROUPS_COUNT) {
        currentGroup = newGroup;
        updateGroupIndicator();
        generateBracketForCurrentGroup();
    }
}

// Get models for current group
function getModelsForCurrentGroup() {
    const startIndex = currentGroup * MODELS_PER_GROUP;
    return tournamentModels.slice(startIndex, startIndex + MODELS_PER_GROUP);
}

// Function to create a match element
function createMatch(round, match, model1, model2) {
    const matchDiv = document.createElement('div');
    matchDiv.className = 'match';
    matchDiv.dataset.round = round;
    matchDiv.dataset.matchId = `${round}-${match}`;

    // Participant 1
    const participant1 = document.createElement('div');
    participant1.className = 'match-participant';
    const participant1Img = document.createElement('img');
    participant1Img.src = model1.thumbnail_url || '/images/default-mascot.svg';
    participant1Img.alt = model1.name || 'Model thumbnail';
    participant1Img.classList.add('participant-thumbnail');

    // Example text label for participant 1
    const participant1Name = document.createElement('span');
    participant1Name.className = 'participant-name';
    participant1Name.textContent = model1.name || 'TBD';

    participant1.appendChild(participant1Img);
    participant1.appendChild(participant1Name);

    // Participant 2
    const participant2 = document.createElement('div');
    participant2.className = 'match-participant';
    const participant2Img = document.createElement('img');
    participant2Img.src = model2.thumbnail_url || '/images/default-mascot.svg';
    participant2Img.alt = model2.name || 'Model thumbnail';
    participant2Img.classList.add('participant-thumbnail');

    // Example text label for participant 2
    const participant2Name = document.createElement('span');
    participant2Name.className = 'participant-name';
    participant2Name.textContent = model2.name || 'TBD';

    participant2.appendChild(participant2Img);
    participant2.appendChild(participant2Name);

    // Append participants to match div
    matchDiv.appendChild(participant1);
    matchDiv.appendChild(participant2);

    return matchDiv;
}

// Function to create a round container
function createRound(roundNumber) {
    const roundDiv = document.createElement('div');
    roundDiv.className = 'round';
    roundDiv.dataset.round = roundNumber;
    return roundDiv;
}

// Function to generate the bracket structure for current group
function generateBracketForCurrentGroup() {
    const groupModels = getModelsForCurrentGroup();
    generateBracket(groupModels);
}

// Function to generate the bracket structure
function generateBracket(models) {
    tournamentBracket.innerHTML = ''; // Clear existing content
    
    // Ensure we have exactly 32 models for this group
    while (models.length < 32) {
        models.push({
            id: `default-${models.length}`,
            name: `TBD Model ${models.length + 1}`,
            mascot: '/images/default-mascot.svg',
            attack_power: 60,
            defense: 60,
            speed_agility: 60,
            strategy: 60,
            endurance: 60
        });
    }
    
    // Always use 32 models (5 rounds: 16->8->4->2->1)
    const numRounds = 5;
    
    // Create rounds
    for (let round = 0; round < numRounds; round++) {
        const roundDiv = createRound(round);
        const matchesInRound = Math.pow(2, numRounds - round - 1);
        
        // Create matches for this round
        for (let match = 0; match < matchesInRound; match++) {
            if (round === 0) {
                // First round - use actual models
                const model1 = models[match * 2];
                const model2 = models[match * 2 + 1];
                const matchDiv = createMatch(round, match, model1, model2);
                roundDiv.appendChild(matchDiv);
            } else {
                // Other rounds - create empty matches
                const matchDiv = createMatch(round, match, 
                    { name: 'TBD', id: null }, 
                    { name: 'TBD', id: null }
                );
                roundDiv.appendChild(matchDiv);
            }
        }
        
        tournamentBracket.appendChild(roundDiv);
    }

    // Create connectors after all matches are placed
    const rounds = document.querySelectorAll('.round');
    rounds.forEach((round, roundIndex) => {
        const matches = round.querySelectorAll('.match');
        matches.forEach((match, matchIndex) => {
            createConnectors(match, roundIndex, matchIndex);
        });
    });
}

// Function to initialize the tournament
async function initializeTournament() {
    try {
        console.log('Initializing tournament...');
        
        // Show loading state
        tournamentBracket.classList.add('loading');
        
        // Fetch models from the gallery API
        console.log('Fetching gallery models...');
        const response = await fetch('/api/modelsTournament');
        if (!response.ok) {
            throw new Error('Failed to fetch models from gallery');
        }
        
        const data = await response.json();
        if (!data.models || !Array.isArray(data.models)) {
            throw new Error('Invalid data received from gallery');
        }
        
        // Format the models for tournament use
        let allModels = data.models.map(model => ({
            id: model.id,
            name: model.name,
            thumbnail_url: model.thumbnail_url,
            model_3d_url: model.model_3d_url,
            attack_power: model.attack_power,
            defense: model.defense,
            speed_agility: model.speed_agility,
            strategy: model.strategy,
            endurance: model.endurance
        }));
        
        console.log(`Found ${allModels.length} models in gallery`);
        
        // Ensure the first 13 models are in the first group
        const firstGroupModels = allModels.slice(0, 13);
        const remainingModels = allModels.slice(13);
        
        // Pad the first group to 32 models
        while (firstGroupModels.length < 32) {
            firstGroupModels.push({
                id: `default-${firstGroupModels.length}`,
                name: `TBD Model ${firstGroupModels.length + 1}`,
                thumbnail_url: '/images/default-mascot.svg',
                model_3d_url: null,
                attack_power: 60,
                defense: 60,
                speed_agility: 60,
                strategy: 60,
                endurance: 60
            });
        }
        
        // Initialize remaining groups
        const totalNeeded = GROUPS_COUNT * MODELS_PER_GROUP - 32; // Subtract first group
        while (remainingModels.length < totalNeeded) {
            remainingModels.push({
                id: `default-${remainingModels.length + 32}`,
                name: `TBD Model ${remainingModels.length + 33}`,
                thumbnail_url: '/images/default-mascot.svg',
                model_3d_url: null,
                attack_power: 60,
                defense: 60,
                speed_agility: 60,
                strategy: 60,
                endurance: 60
            });
        }
        
        // Randomly shuffle only the remaining models
        for (let i = remainingModels.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [remainingModels[i], remainingModels[j]] = [remainingModels[j], remainingModels[i]];
        }
        
        // Combine first group with remaining groups
        tournamentModels = [...firstGroupModels, ...remainingModels];
        
        // Update model counter
        updateModelCounter(allModels.length, GROUPS_COUNT * MODELS_PER_GROUP);
        
        // Set current group to 0 (first group)
        currentGroup = 0;
        
        // Create group navigation and generate bracket
        console.log('Creating group navigation...');
        createGroupNavigation();
        
        // Generate the bracket for the first group
        console.log('Generating bracket for first group...');
        generateBracketForCurrentGroup();
        
        // Update the group indicator to show "Group 1 of 32"
        updateGroupIndicator();
        
        console.log('Tournament initialization complete');
        
    } catch (error) {
        console.error('Error initializing tournament:', error);
        tournamentBracket.innerHTML = `
            <div class="error-message">
                Error loading tournament bracket: ${error.message}
                <br>
                <button onclick="initializeTournament()" class="retry-button">
                    Retry
                </button>
            </div>
        `;
    } finally {
        // Remove loading state
        tournamentBracket.classList.remove('loading');
    }
}

// Start timer updates
setInterval(updateTimer, 1000);
updateTimer(); // Initial update

// Add keyboard navigation
document.addEventListener('keydown', (event) => {
    if (event.key === 'ArrowLeft') {
        navigateGroup(-1);
    } else if (event.key === 'ArrowRight') {
        navigateGroup(1);
    }
});

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded, initializing tournament...');
    initializeTournament();
});
