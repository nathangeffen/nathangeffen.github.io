/*
  EpiAgents: simulating infectious diseases.

  Agent based modelling of infectious disease epidemics.
  Copyright (C) 2021  Nathan Geffen

  This program is free software: you can redistribute it and/or modify
  it under the terms of the GNU Affero General Public License as
  published by the Free Software Foundation, either version 3 of the
  License, or (at your option) any later version.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
  GNU Affero General Public License for more details.

  You should have received a copy of the GNU Affero General Public License
  along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
  There are two classes: EpiAgents and EpiAgentsUI.

  The EpiAgents class is responsible for executing the simulation (or model
  world) that consists of agents moving about in a 2-d plane, knocking into each
  other and, sometimes, becoming infected. The simulation is continuously
  iterated. On each iteration agents may also change states, e.g. recover, get
  vaccinated, isolate etc.

  The EpiAgentUI class is responsible for the browser user interface. It is
  responsible for iteratively drawing the canvas on which the simulation takes
  place, drawing the accompanying chart, providing a form for users to change
  the model parameters, and printing the model output.
 */


"use strict";

(function (EpiAgents) {

    let SimulationStates = {
        SUSCEPTIBLE: {
            description: "susceptible",
            color: "rgb(0, 0, 255)",
            infected: false,
            infectiousness: 0.0,
            initialRatio: 95,
            nextStateProb: {
                VACCINATED: 0.0025
            }
        },
        INFECTED_EXPOSED: {
            description: "exposed",
            color: "rgb(200, 0, 0)",
            infected: true,
            infectiousness: 0.0,
            initialRatio: 3,
            nextStateProb: {
                INFECTED_ASYMPTOMATIC: 0.33
            }
        },
        INFECTED_ASYMPTOMATIC: {
            description: "asymptomatic",
            color: "rgb(210, 0, 0)",
            infected: true,
            infectiousness: 0.1,
            initialRatio: 1,
            nextStateProb: {
                INFECTED_SYMPTOMATIC: 0.33,
                RECOVERED: 0.33
            }
        },
        INFECTED_SYMPTOMATIC: {
            description: "symptomatic",
            color: "rgb(220, 0, 0)",
            infected: true,
            infectiousness: 0.5,
            initialRatio: 1,
            nextStateProb: {
                INFECTED_ISOLATED: 0.1,
                INFECTED_HOSPITAL: 0.1,
                RECOVERED: 0.1
            }
        },
        INFECTED_ISOLATED: {
            description: "isolated",
            color: "rgb(225, 0, 0)",
            infected: true,
            infectiousness: 0.001,
            initialRatio: 0,
            nextStateProb: {
                INFECTED_HOSPITAL: 0.1,
                RECOVERED: 0.1
            }
        },
        INFECTED_HOSPITAL: {
            description: "hospitalized",
            color: "rgb(230, 0, 0)",
            infected: true,
            infected: true,
            infectiousness: 0.5,
            initialRatio: 0,
            nextStateProb: {
                INFECTED_ICU: 0.1,
                RECOVERED: 0.1
            }
        },
        INFECTED_ICU: {
            description: "high care",
            color: "rgb(240, 0, 0)",
            infected: true,
            infectiousness: 0.5,
            initialRatio: 0,
            nextStateProb: {
                DEAD: 0.5,
                RECOVERED: 0.1
            }
        },
        TREATED: {
            description: "treated",
            color: "rgb(0, 150, 40)",
            infected: true,
            infectiousness: 0.001,
            initialRatio: 0,
            nextStateProb: {
                DEAD: 0.0001,
                INFECTED_ASYMPTOMATIC: 0.001
            }
        },
        RECOVERED: {
            description: "recovered",
            color: "rgb(0, 150, 0)",
            infected: false,
            infectiousness: 0.0,
            initialRatio: 0,
            nextStateProb: {
                SUSCEPTIBLE: 0.001,
                VACCINATED: 0.001
            }
        },
        VACCINATED: {
            description: "vaccinated",
            color: "rgb(0, 255, 0)",
            infected: false,
            infectiousness: 0.0,
            initialRatio: 0,
            nextStateProb: {
                SUSCEPTIBLE: 0.0005
            }
        },
        DEAD: {
            description: "dead",
            color: "rgb(0, 0, 0)",
            infected: false,
            infectiousness: 0.0,
            initialRatio: 0,
            nextStateProb: {}
        },
    };

    EpiAgents.SimulationStates = SimulationStates;

    const SimulationPhase = {
        PAUSED: 0,
        PLAYING: 1
    };
    EpiAgents.SimulationPhase = SimulationPhase;

    const EventPhase = {
        BEFORE: 0,
        DURING: 1,
        AFTER: 2
    };
    EpiAgents.EventPhase = EventPhase;



    const DIRECTION = [ [-1, -1], [-1, 0], [-1, 1], [0, -1],
                        [0, 1], [1, -1], [1, 0], [1, 1]];

    function round(value, places=0) {
        let val = value * Math.pow(10, places);
        return Math.round(val) / Math.pow(10, places);
    }

    /* From
       https://stackoverflow.com/questions/25582882/javascript-math-random-normal-distribution-gaussian-bell-curve
     */
    function gaussian(mean, stdev) {
        var y2;
        var use_last = false;
        return function() {
            var y1;
            if (use_last) {
                y1 = y2;
                use_last = false;
            } else {
                var x1, x2, w;
                do {
                    x1 = 2.0 * Math.random() - 1.0;
                    x2 = 2.0 * Math.random() - 1.0;
                    w = x1 * x1 + x2 * x2;
                } while (w >= 1.0);
                w = Math.sqrt((-2.0 * Math.log(w)) / w);
                y1 = x1 * w;
                y2 = x2 * w;
                use_last = true;
            }

            var retval = mean + stdev * y1;
            if (retval > 0)
                return retval;
            return -retval;
        }
    }

    function deepCopy(aObject) {
        if (!aObject) return aObject;
        if (typeof aObject === "string" || typeof aObject === "number")
            return aObject;
        let v;
        let bObject = Array.isArray(aObject) ? [] : {};
        for (const k in aObject) {
            v = aObject[k];
            bObject[k] = (typeof v === "object") ? deepCopy(v) : v;
        }
        return bObject;
    }

    EpiAgents.deepCopy = deepCopy;

    function objToString(obj, indent=0) {
        let str;
        let t = typeof(obj);
        let delim = "    ";
        let spaces = "";
        let functionSpaces = "";
        for (let i = 0; i < indent; i++) {
            spaces += delim;
        }
        for (let i = 0; i < indent - 1; i++) {
            functionSpaces += delim;
        }

        if (t === "undefined") {
            str = "";
        } else if (t === "number") {
            str = obj.toString();
        } else if (t === "function") {
            str = obj.toString();

            // A valiant but not very good attempt to format functions nicely
            let lines = str.split("\n");
            for (let i = 1; i < lines.length; i++) {
                 lines[i] = functionSpaces + lines[i];
            }
            str = "";
            for (let i = 0; i < lines.length; i++) {
                str += lines[i] + "\n";
            }
            str = str.slice(0, -1); // Get rid of last "\n"

        } else if (t === "object") {
            if (Array.isArray(obj)) {
                str = "[\n";
                for (let elem of obj) {
                    str += spaces + delim + objToString(elem, indent + 1) + ",\n";
                }
                str += spaces + "]";
            } else {
                str = "{\n";
                for (let elem in obj) {
                    str += spaces + delim + elem + ": " +
                        objToString(obj[elem], indent + 1) + ",\n";
                }
                str += spaces + "}";
            }
        } else {
            str = '"' + obj.toString() + '"';
        }
        return str;
    }

    EpiAgents.objToString = objToString;

    function shuffleArray(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    }

    function createShuffledIndices(n) {
        let arr = Array.from(new Array(n), (x,i) => i+1);
        for (let i = 0; i < n; i++) arr[i] = i;
        shuffleArray(arr);
        return arr;
    }

    function distanceSquared(x1, x2, y1, y2) {
        let x = (x1 - x2);
        x = x * x;
        let y = y1 - y2;
        y = y * y;
        return x + y;
    }

    function detectCollision(sim, agent_a, agent_b) {
        if (distanceSquared(agent_a.x, agent_b.x, agent_a.y, agent_b.y) <
            (agent_a.radius + agent_b.radius) *
            (agent_a.radius + agent_b.radius)) {
            ++sim.collisions;
            return true;
        }

        if (distanceSquared(agent_a.x + agent_a.dx,
                            agent_b.x + agent_b.dx,
                            agent_a.y + agent_a.dy,
                            agent_b.y + agent_b.dy) <
            (agent_a.radius + agent_b.radius) *
            (agent_a.radius + agent_b.radius)) {
            return true;
        }

        return false;
    }

    function makeInfection(from_agent, to_agent, risk) {
        if (Math.random() < risk) {
            to_agent.states.push([to_agent.sim.iteration, "INFECTED_EXPOSED"]);
            ++to_agent.sim.counters.total_simulation_infections.num;
        }
    }

    function eventMoveAgents(sim) {
        for (let agent of sim.agents) {
            if (agent.getStateKey() != "DEAD")
                agent.move();
        }
    }

    function eventAdvanceAgents(sim) {
        for (let agent of sim.agents) {
            for (const state in agent.cluster.states) {
                if (agent.cluster.states.hasOwnProperty(state) &&
                    agent.getStateKey() === state) {
                    for (const next_state in
                         agent.cluster.states[state].nextStateProb) {
                        const risk =
                              agent.cluster.states[state].nextStateProb[next_state];
                        if (Math.random() < risk) {
                            agent.states.push([sim.iteration, next_state]);
                            break;
                        }
                    }
                }
            }
        }
    }

    function eventCalcResults(sim) {
        for (const key in sim.counters) {
            if (key.substr(0, 6) !== "total_") {
                sim.counters[key].num = 0;
            }
        }
        for (const agent of sim.agents) {
            const state = agent.getStateKey();
            if (state in sim.counters) {
                ++sim.counters[state].num;
            }
            if (agent.cluster.states[state].infected)
                ++sim.counters.infections.num;
            if (state !== "DEAD")
                ++sim.counters.alive.num;
        }
    }

    EpiAgents.eventCalcResults = eventCalcResults;

    function eventRecordResultHeader(sim) {
        let header = ["#",];
        for (let key in sim.counters) header.push(key);
        sim.results.push(header);
    }

    EpiAgents.eventRecordResultHeader = eventRecordResultHeader;

    function eventRecordResult(sim) {
        let result = [];
        if (sim.eventPhase === EpiAgents.EventPhase.DURING) {
            result.push(sim.iteration);
        } else if (sim.eventPhase === EpiAgents.EventPhase.BEFORE) {
            result.push("S");
        } else if (sim.eventPhase === EpiAgents.EventPhase.AFTER) {
            result.push("E");
        }
        for (let key in sim.counters)
            result.push(sim.counters[key].num);
        sim.results.push(result);
    }

    function ifElse(x, y) {
        if (x !== undefined)
            return x;
        return y;
    }

    EpiAgents.eventRecordResult = eventRecordResult;

    class Agent {
        constructor(sim, cluster) {
            this.sim = sim;
            this.radius = sim.config.agentRadius;
            this.id = sim.agentCounter;
            sim.agentCounter++;
            this.speed = sim.config.agentSpeed;
            this.states = [];
            let index;
            if (cluster === undefined) {
                index = Math.floor(Math.random() * sim.clusters.length);
                cluster = sim.clusters[index];
            }
            this.cluster = cluster;
            this.x = Math.random() * (this.cluster.right - this.cluster.left) +
                this.cluster.left;
            this.y = Math.random() * (this.cluster.bottom - this.cluster.top) +
                this.cluster.top;
            this.correctPosition();
            this.movementRandomness = gaussian(
                sim.config.movementRandomnessMean,
                sim.config.movementRandomnessStdev);
            this.setDirection();
        }

        getStateKey() {
            return this.states[this.states.length - 1][1];
        }

        getState() {
            return this.cluster.states[this.getStateKey()];
        }

        setDirection() {
            const index = Math.floor(Math.random() * 8.0);
            this.dx = DIRECTION[index][0] * this.speed;
            this.dy = DIRECTION[index][1] * this.speed;
        }

        getInfectiousness() {
            const state = this.getState();
            return this.getState().infectiousness;
        }

        infectAgent(agent) {
            let this_infectiousness = this.getInfectiousness();
            let agent_infectiousness = agent.getInfectiousness();
            if (this.getStateKey() === "SUSCEPTIBLE" && agent_infectiousness > 0) {
                makeInfection(agent, this, agent_infectiousness);
            } else if (agent.getStateKey() === "SUSCEPTIBLE" &&
                       this_infectiousness > 0) {
                makeInfection(this, agent, this_infectiousness);
            }
        }

        detectInfections() {
            for (let agent of this.sim.agents) {
                if (agent.id !== this.id) {
                    if (detectCollision(this.sim, this, agent)) {
                        if (this.sim.config.elasticCollisions &&
                            this.id < agent.id) {
                            const dx = this.dx;
                            this.dx = agent.dx;
                            agent.dx = dx;
                            const dy = this.dy;
                            this.dy = agent.dy;
                            agent.dy = dy;
                        }
                        this.infectAgent(agent);
                    }
                }
            }
        }

        correctPosition() {
            if (this.x - this.radius < this.cluster.left)
                this.x = this.cluster.left + this.radius;
            else if (this.x + this.radius > this.cluster.right)
                this.x = this.cluster.right - this.radius;
            if (this.y - this.radius < this.cluster.top)
                this.y = this.cluster.top + this.radius;
            else if (this.y + this.radius > this.cluster.bottom)
                this.y = this.cluster.bottom - this.radius;
        }

        move() {
            if (this.getStateKey() === "DEAD") {
                this.x = this.y = -1000;
                return;
            }
            if (Math.random() < this.movement_randomness) {
                this.setDirection();
            }

            if (this.x + this.dx >= this.cluster.right - this.radius ||
                this.x + this.dx <= this.cluster.left + this.radius) {
                this.dx = -this.dx;
            }
            if (this.y + this.dy >= this.cluster.bottom - this.radius ||
                this.y + this.dy <= this.cluster.top + this.radius) {
                this.dy = -this.dy;
            }

            this.detectInfections();

            this.x += this.dx;
            this.y += this.dy;
            this.correctPosition();
        }
    };

    class Simulation {

        processOptions(options) {
            // Simulation parameters
            this.config = {};
            let config = this.config;
            config.name = options.name || null;
            config.description = options.description || null;
            config.width = options.width || 320;
            config.height = options.height || 320;
            config.maxArea = options.maxArea || config.width * config.height;
            config.interval = options.interval || 0;
            config.agentRadius = options.agentRadius || 3;
            config.movementRandomnessMean = options.movementRandomnessMean || 0.0;
            config.movementRandomnessStdev = options.movementRandomnessStdev || 0.0;
            config.elasticCollisions = options.elasticCollisions || true;
            config.agentSpeed = ifElse(options.agents_speed, 1.0);
            config.maxIterations = options.maxIterations || 0;
            config.extraBeforeEvents = options.extraBeforeEvents || [];
            config.extraDuringEvents = options.extraDuringEvents || [];
            config.extraAfterEvents = options.extraAfterEvents || [];

            config.clusters =  [
                {
                    name: "default",
                    left: 0,
                    top: 0,
                    right: config.width,
                    bottom: config.height,
                    border: true,
                    borderColor: "black",
                    numAgents: options.numAgents || 0,
                    states: options.simulationStates || deepCopy(SimulationStates),
                    beforeEvents: options.beforeEvents ||
                        [].concat(config.extraBeforeEvents),
                    duringEvents: options.duringEvents ||
                        [eventAdvanceAgents, eventMoveAgents, eventCalcResults,
                         eventRecordResult].
                        concat(config.extraDuringEvents) || options.duringEvents,
                    afterEvents: options.afterEvents ||
                        [eventCalcResults, eventRecordResult].
                        concat(config.extraAfterEvents)
                },
            ];

            if ("clusters" in options) {
                for (let i = 0; i < options.clusters.length; i++) {
                    if (i > 0) config.clusters.push(deepCopy(config.clusters[0]));
                    for (let key in options.clusters[i]) {
                        config.clusters[i][key] = deepCopy(options.clusters[i][key]);
                    }
                }
            }
            this.clusters = config.clusters;
            this.state = SimulationPhase.PAUSED;
            this.timer = undefined;
            this.agentCounter = options.agentCounter || 0;
            this.agents = [];
            this.user_counters = {};

            for (let state in SimulationStates) {
                this.user_counters[state] = {
                    num: 0,
                    print: false,
                }
            }
            this.user_counters["SUSCEPTIBLE"].print = true;
            this.user_counters["RECOVERED"].print = true;
            this.compulsory_counters = {
                alive: {
                    print: true,
                    num: 0
                },
                total_initial_infections: {
                    print: false,
                    num: 0
                },
                total_simulation_infections: {
                    print: true,
                    num: 0
                },
                infections: {
                    print: true,
                    num: 0
                }
            };
            this.counters = {
                ...this.compulsory_counters,
                ...this.user_counters
            };
            this.eventPhase = options.eventPhase || EventPhase.BEFORE;
            this.results = [];
            this.iteration = 0;
        }

        constructor(options) {
            this.processOptions(options);
        }

        setClusterInitialRatio(cluster, state, val) {
            if (state in cluster.states) {
                cluster.states[state].initialRatio = val;
            } else {
                throw "Error in setInitialRatio. Unknown state: " + state;
            }
        }

        setInitialRatio(state, val) {
            this.setClusterInitialRatio(this.clusters[0], state, val);
        }

        setInitialRatios(arr) {
            for (let cluster of this.clusters)
                for (const parms of arr)
                    this.setClusterInitialRatio(cluster, parms[0], parms[1]);
        }

        clearClusterInitialRatio(cluster, state) {
            this.setClusterInitialRatio(cluster, state, 0);
        }

        ClearInitialRatio(state) {
            this.clearClusterInitialRatio(this.clusters[0], state);
        }

        clearAllInitialRatios() {
            for (let cluster of this.clusters) {
                for (let state in cluster.states)
                    this.clearClusterInitialRatio(cluster, state);
            }
        }

        setClusterStateInfectiousness(cluster, state, val) {
            if (state in cluster.states) {
                cluster.states[state].infectiousness = val;
            } else {
                throw "Error in setInfectiousness. Unknown state: " + state;
            }
        }

        setInfectiousness(state, val) {
            this.setClusterStateInfectiousness(this.clusters[0], state, val);
        }

        setClusterInfectiousnesses(cluster, arr) {
            for (const parms of arr)
                this.setClusterInfectiousness(cluster, parms[0], parms[1]);
        }

        setInfectiousnesses(arr) {
            for (let cluster of this.clusters)
                this.setClusterInfectiousnesses(cluster, arr)
        }

        clearClusterStateInfectiousness(cluster, state) {
            this.setClusterStateInfectiousness(cluster, state, 0.0);
        }

        clearClusterInfectiousness(cluster) {
            for (const state in cluster.states) {
                this.clearClusterStateInfectiousness(cluster, state);
            }
        }

        clearAllInfectiousness(state) {
            for (let cluster of this.clusters)
                this.clearClusterInfectiousness(cluster);
        }

        setClusterTransition(cluster, from_state, to_state, val) {
            if (!from_state in cluster.states) {
                throw "Error in setClusterTransition. Unknown from state: " +
                    from_state;
            }
            if (!to_state in cluster.states) {
                throw "Error in setClusterTransitions. Unknown to state: " +
                    to_state;
            }
            cluster.states[from_state].nextStateProb[to_state] = val;
        }

        setClusterTransitions(cluster, arr) {
            for (const parms of arr)
                this.setClusterTransition(cluster, parms[0], parms[1], parms[2]);
        }

        setTransitions(arr) {
            for (const cluster of this.clusters)
                this.setClusterTransitions(cluster, arr);
        }

        clearClusterStateTransitions(cluster, state) {
            cluster.states[state].nextStateProb = {};
        }

        clearAllClusterTransitions(cluster) {
            for (let state in cluster.states) {
                this.clearClusterStateTransitions(cluster, state);
            }
        }

        clearAllTransitions() {
            for (let cluster of this.clusters) {
                this.clearAllClusterTransitions(cluster);
            }
        }

        clear() {
            this.clearAllTransitions();
            this.clearAllInfectiousness();
            this.clearAllInitialRatios();
        }

        runEvents(events) {
            for (let event of events) event(this);
        }

        beforeIteration() {
            this.eventPhase = EventPhase.BEFORE;
            for (let cluster of this.clusters)
                this.runEvents(cluster.beforeEvents);
        };

        oneIteration() {
            this.eventPhase = EventPhase.DURING;
            for (let cluster of this.clusters)
                this.runEvents(cluster.duringEvents);
            ++this.iteration;
            if (this.config.maxIterations > 0 &&
                this.iteration % this.config.maxIterations === 0) {
                this.stop();
            }
        }

        afterIteration() {
            this.eventPhase = EventPhase.AFTER;
            for (let cluster of this.clusters)
                this.runEvents(cluster.afterEvents);
        };

        step() {
            if (this.state != SimulationPhase.PLAYING) {
                if (this.iteration === 0)
                    this.beforeIteration();
                this.oneIteration();
            }
        }

        play() {
            if (this.state != SimulationPhase.PLAYING) {
                this.state = SimulationPhase.PLAYING;
                let sim = this;
                if (this.iteration === 0)
                    this.beforeIteration();
                this.timer = setInterval(function() {
                    sim.oneIteration();
                }, this.config.interval);
            }
        }

        pause() {
            if (this.state != SimulationPhase.PAUSED) {
                this.state = SimulationPhase.PAUSED;
                clearInterval(this.timer);
                this.timer = undefined;
            }
        }

        stop() {
            this.pause();
            this.afterIteration();
        }

        generateAgents(numAgents, cluster) {
            for (let i = 0; i < numAgents; i++) {
                this.agents.push(new Agent(this, cluster));
            }
            //this.config.numAgents = this.agents.length;
        }

        calcInitialRatios() {
            for (let cluster of this.clusters) {
                let total = 0.0;
                for (const state in cluster.states) {
                    total += parseFloat(cluster.states[state].initialRatio);
                }
                let cumulative = 0.0;
                for (let state in cluster.states) {
                    let r = cluster.states[state].initialRatio / total;
                    cluster.states[state]["initial_proportion"] = cumulative + r;
                    cumulative += r;
                }
            }
        }

        calcInitialStates(from = 0, to) {
            if (to === undefined) {
                to = this.agents.length;
            }
            for (let i = from; i < to; i++) {
                let agent = this.agents[i];
                let r = Math.random();
                for (const state in agent.cluster.states) {
                    if (r < agent.cluster.states[state].initial_proportion) {
                        agent.states.push(["S", state]);
                        if (agent.cluster.states[state].infected)
                            ++this.counters.total_initial_infections.num;
                        break;
                    }
                }
            }
        }

        createAgents() {
            this.agents = [];
            for (const cluster of this.clusters) {
                this.generateAgents(cluster.numAgents, cluster);
            }
        }

        removeAgents(n) {
            for (let i = 0; i < n; i++) {
                this.agents.pop();
            }
            //this.config.numAgents = this.agents.length;
        }

        initialize() {
            this.createAgents();
            this.calcInitialRatios();
            this.calcInitialStates();
            eventCalcResults(this);
        }

    }

    EpiAgents.create = function(options={}) {
        let sim = new Simulation(options);
        return sim;
    }

    EpiAgents.Simulation = Simulation;

} (window.EpiAgents = window.EpiAgents || {}));



(function (EpiAgentsUI) {

    const INI = "epi-initial-ratio-";
    const INF = "epi-infectiousness-";
    const INI_SLIDER = INI + "slider-"
    const INF_SLIDER = INF + "slider-"
    EpiAgentsUI.default_options = {
        chart_options: {
            animation: false,
            aspectRatio: 790.0 / 500.0
        }
    };

    let ui_elements = {};

    EpiAgentsUI.ui_elements = ui_elements;

    function correctDimensions(div_id, sim)
    {
        let cs = getComputedStyle(sim.sim_div);
        let paddingX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
        let borderX = parseFloat(cs.borderLeftWidth) +
            parseFloat(cs.borderRightWidth);
        let elementWidth = sim.sim_div.offsetWidth - paddingX - borderX;
        let elementHeight = elementWidth;
        sim.config.width = Math.min(sim.config.width, elementWidth);
        sim.config.height = Math.min(sim.config.height, elementHeight);
        sim.config.maxArea = sim.config.width * sim.config.height;
        for (let cluster of sim.clusters) {
            if (cluster.bottom > sim.config.height)
                cluster.bottom = sim.config.height;
            if (cluster.right > sim.config.width)
                cluster.right = sim.config.width;
        }
    }

    function createSimulationCanvas(div_id, sim)
    {
        sim.canvas = ui_elements[div_id].canvas;
        sim.canvas.id = div_id + '-canvas';
        sim.canvas.width = sim.config.width;
        sim.canvas.height = sim.config.height;
        sim.ctx = sim.canvas.getContext("2d");
        const sim_div = ui_elements[div_id].sim_div;
        const div_width = sim_div.clientWidth;
        const div_height = sim_div.clientHeight;
    }

    function drawAgent(agent)
    {
        if (agent.getStateKey() !== "DEAD") {
            let ctx = agent.sim.ctx;
            ctx.beginPath();
            ctx.arc(agent.x, agent.y, agent.radius, 0, Math.PI*2);
            ctx.fillStyle = agent.getState().color;
                ctx.fill();
            ctx.closePath();
        }
    }

    EpiAgentsUI.drawAgent = drawAgent;

    function drawCluster(ctx, cluster)
    {
        if (cluster.border) {
            ctx.beginPath();
            ctx.strokeStyle = cluster.borderColor;
            ctx.fillStyle = "red";
            ctx.rect(cluster.left, cluster.top,
                     cluster.right - cluster.left,
                     cluster.bottom - cluster.top);
            ctx.stroke();
        }
    }

    EpiAgentsUI.drawCluster = drawCluster;

    function eventDrawCanvas(sim)
    {
        sim.ctx.clearRect(0, 0, sim.config.width, sim.config.height);
        for (let cluster of sim.clusters) {
            EpiAgentsUI.drawCluster(sim.ctx, cluster);
        }
        for (let agent of sim.agents) {
            EpiAgentsUI.drawAgent(agent);
        }
    }

    function createGraph(elem, sim)
    {
        const labels = [
            [sim.iteration]
        ];
        const data = {
            labels: labels,
            datasets: [
                {
                    label: sim.clusters[0].states.SUSCEPTIBLE.description,
                    backgroundColor: sim.clusters[0].states.SUSCEPTIBLE.color,
                    borderColor: sim.clusters[0].states.SUSCEPTIBLE.color,
                    data: [sim.counters["SUSCEPTIBLE"].num],
                },
                {
                    label: 'infected',
                    backgroundColor: sim.clusters[0].states.
                        INFECTED_SYMPTOMATIC.color,
                    borderColor: sim.clusters[0].states.INFECTED_SYMPTOMATIC.color,
                    data: [sim.counters.infections.num],
                },
                {
                    label: sim.clusters[0].states.RECOVERED.description,
                    backgroundColor: sim.clusters[0].states.RECOVERED.color,
                    borderColor: sim.clusters[0].states.RECOVERED.color,
                    data: [sim.counters.RECOVERED.num],
                }
            ]
        };
        const config = {
            type: 'line',
            data,
            options: sim.chart_options
        };
        let chart = new Chart(elem, config);
        return chart;
    }

    function updateGraph(sim)
    {
        let chart = sim.chart;
        chart.data.labels.push(sim.iteration);
        chart.data.datasets[0].data.push(sim.counters.SUSCEPTIBLE.num);
        chart.data.datasets[1].data.push(sim.counters.infections.num);
        chart.data.datasets[2].data.push(sim.counters.RECOVERED.num);
        chart.update();
    }

    EpiAgentsUI.updateGraph = updateGraph;

    function writeResultsHeader(div, sim)
    {
        let table = div.getElementsByTagName("table")[0];
        table.insertRow();
        let head = table.createTHead();
        let row = head.insertRow(0);
        let cell = row.insertCell(0);
        cell.innerHTML = "#";
        for (let stat in sim.counters) {
            if (sim.counters[stat].print) {
                let cell = row.insertCell(-1);
                if (stat in EpiAgents.SimulationStates)
                    cell.innerHTML = EpiAgents.SimulationStates[stat].description;
                else
                    cell.innerHTML = stat.replace(/_/g, ' ');
            }
        }
    }

    EpiAgentsUI.writeResultsHeader = writeResultsHeader;

    function writeResults(div, sim) {
        let table = div.getElementsByTagName("table")[0];
        let row = table.insertRow(1);
        let cell = row.insertCell(0);
        if (sim.eventPhase === EpiAgents.EventPhase.DURING) {
            cell.innerHTML = sim.iteration;
        } else if (sim.eventPhase === EpiAgents.EventPhase.BEFORE) {
            cell.innerHTML = "S";
        } else if (sim.eventPhase === EpiAgents.EventPhase.AFTER) {
            cell.innerHTML = "E";
        }
        for (let stat in sim.counters) {
            if (sim.counters[stat].print) {
                let cell = row.insertCell(-1);
                cell.innerHTML = sim.counters[stat].num;
            }
        }
    }

    EpiAgentsUI.writeResults = writeResults;

    function createUIElements(div_id) {
        let div = document.getElementById(div_id);

        let sim_div =  document.createElement("div");
        sim_div.classList.add('epi-game');

        let sim_min_max = document.createElement("button");
        sim_min_max.classList.add("epi-min-max");
        sim_min_max.textContent = "x";
        sim_div.append(sim_min_max);

        let canvas = document.createElement("canvas");
        canvas.classList.add("epi-game-canvas");
        sim_div.append(canvas);

        let simStatus = document.createElement("div");
        simStatus.classList.add('epi-game-status');
        simStatus.textContent = " ";
        sim_div.append(simStatus);

        div.append(sim_div);

        let chart_holder  = document.createElement("div");
        let chart = document.createElement("canvas");
        let chart_min_max = document.createElement("button");
        chart_holder.classList.add('epi-chart-holder');
        chart.classList.add('epi-chart');
        chart_min_max.classList.add("epi-min-max");
        chart_min_max.textContent = "x";
        div.append(chart_holder);
        chart_holder.append(chart_min_max);
        chart_holder.append(chart);

        let parameterBox = document.createElement("div");
        parameterBox.classList.add('epi-parameter-box');

        let parameter_min_max = document.createElement("button");
        parameter_min_max.classList.add("epi-min-max");
        parameter_min_max.textContent = "x";
        parameterBox.append(parameter_min_max);
        div.append(parameterBox);

        let parameters = document.createElement("div");
        parameters.classList.add('epi-parameters');
        parameterBox.append(parameters);

        let showZeros = document.createElement("div");
        showZeros.classList.add('epi-show-zeros');
        parameterBox.append(showZeros);

        let resultsBox = document.createElement("div");
        resultsBox.classList.add("epi-results-box");

        let resultsMinMax = document.createElement("button");
        resultsMinMax.classList.add("epi-min-max");
        resultsMinMax.textContent = "x";
        resultsBox.append(resultsMinMax);

        let results = document.createElement("div");
        results.classList.add('epi-results');

        let table = document.createElement("table");
        results.append(table);
        resultsBox.append(results);
        div.append(resultsBox);

        let download = document.createElement("div");
        download.classList.add('epi-download-box');
        download.textContent = "Download: ";
        resultsBox.append(download);

        let downloadConfig = document.createElement("span");
        downloadConfig.classList.add('epi-download');
        download.append(downloadConfig);

        let downloadResults = document.createElement("span");
        downloadResults.classList.add('epi-download');
        download.append(downloadResults);

        let downloadAgents = document.createElement("span");
        downloadAgents.classList.add('epi-download');
        downloadAgents.title = "Agent state changes in CSV format";
        download.append(downloadAgents);

        let controls = document.createElement("div");
        controls.classList.add('epi-controls');
        div.append(controls);

        let play = document.createElement("button");
        play.textContent = "Run";
        play.classList.add('epi-button');
        controls.append(play);

        let step = document.createElement("button");
        step.textContent = "Step";
        step.classList.add('epi-button');
        controls.append(step);

        let reset = document.createElement("button");
        reset.textContent = "Reset";
        reset.classList.add('epi-button');
        controls.append(reset);

        ui_elements[div_id] = {
            'sim_div': sim_div,
            'simStatus': simStatus,
            'canvas': canvas,
            'chart': chart,
            'parameterBox': parameterBox,
            'parameters': parameters,
            'results': results,
            'showZeros': showZeros,
            'downloadResults': downloadResults,
            'downloadConfig': downloadConfig,
            'downloadAgents': downloadAgents,
            'play': play,
            'step': step,
            'reset': reset,
        };
    }

    function makeInput(elem, desc, div_id, val, name, min=0, max=2000, step=1) {
        let output =
            "<span class='epi-entry'>" + "<label for='" + div_id + name + "' " +
            "class='epi-description'>" + desc + "</label>" +
            "<input id='" + div_id + name + "' class='epi-value' value=" + val +
            " /> <input id='" + div_id + name + "-slider'" +
            " type='range' min=" + min + " max=" + max + " step=" + step +
            " class='epi-slider' value=" + val + " /></span>";
        elem.insertAdjacentHTML("beforeend", output);
        document.getElementById(div_id + name).
            addEventListener("change", function(e) {
                let slider =  document.getElementById(div_id + name + '-slider');
                slider.value = parseFloat(e.target.value);
                let event = new Event('input');
                slider.dispatchEvent(event);
            });
        document.getElementById(div_id + name + '-slider').
            addEventListener("input", function(e) {
                document.getElementById(div_id + name).value = e.target.value;
            });
    }

    function setupTransitionTable(sim, cluster, elem) {
        const keys = Object.keys(cluster.states);
        const n = keys.length;
        let table = document.createElement("table");
        table.classList.add("epi-transition-table");
        elem.appendChild(table);
        let head = table.createTHead();
        let row = head.insertRow();
        for (let i = 0; i <= n; i++) {
            let cell = row.insertCell();
            if (i == 0)
                cell.innerHTML = "<sub>from</sub>&#9;<sup>to</sup>";
            else
                cell.innerHTML = cluster.states[keys[i - 1]].description;
        }
        for (let i = 0; i < n; i++) {
            let row = table.insertRow();
            for (let j = 0; j <= n; j++) {
                let cell = row.insertCell();
                if (j == 0) {
                    cell.innerHTML = cluster.states[keys[i]].description;
                } else if (i != j-1) {
                    const from = keys[i];
                    const to = keys[j-1];
                    cell.classList.add("epi-transition-" + from + "-" + to);
                    cell.classList.add("epi-transition-editable");
                    cell.contentEditable = true;
                    cell.addEventListener("input", function(e) {
                        cluster.states[from].nextStateProb[to] =
                            Math.max(0.0,
                                     Math.min(1.0,
                                              parseFloat(e.target.textContent)));
                    });
                    if (to in cluster.states[from].nextStateProb) {
                        cell.innerHTML = cluster.states[from].nextStateProb[to];
                    } else {
                        cell.innerHTML = 0.0;
                    }
                } else {
                    cell.classList.add("epi-transition-na");
                }
            }
        }
    }

    function showParameters(sim, elem) {
        elem.innerHTML = "";
        let infectious_ids = [];
        let initialRatio_ids = [];
        let output = "";
        if (sim.config.name)
            output += "<h2 class='epi-model-name'>" +
            sim.config.name + "</h2>";
        if (sim.config.description)
            output += "<p class='epi-model-description'>" +
            sim.config.description + "<p>";
        elem.insertAdjacentHTML("beforeend", output);
        makeInput(elem, "speed (millisecs)", sim.div_id, sim.config.interval,
                  "-speed");

        sim.clusters.forEach(function(cluster, c) {
            let div = document.createElement("div");
            div.id = "epi-cluster-" + sim.div_id + "-" + c;
            elem.append(div);
            output = "<h3 class='epi-cluster-name'>Cluster: " + c + " - " +
                cluster.name + "</h3>";
            div.insertAdjacentHTML("beforeend", output);
            makeInput(div, "Number of agents", sim.div_id + c,
                      cluster.numAgents, "-agents", 0, 5000, 1);

            const clusterWidth = sim.clusters[0].right - sim.clusters[0].left;
            const clusterHeight = sim.clusters[0].bottom - sim.clusters[0].top;
            let area = (Math.sqrt(clusterWidth * clusterHeight) /
                        Math.sqrt(sim.config.maxArea) * 100).toFixed(1);
            makeInput(div, "area (% of max)", sim.div_id + c, area, "-area",
                      10, 100, 1);

            const states = sim.clusters[0].states;

            // Infectiousness
            div.insertAdjacentHTML("beforeend",
                                   "<h4 class='epi-model-infectiousness'>" +
                                   "Infectiousness</h4>");
            for (const state in states) {
                if (state.substr(0, 8) === "INFECTED") {
                    let id = sim.inf_slider + c + "-" + state + "-slider";
                    makeInput(div, states[state].description, id,
                              states[state].infectiousness.toFixed(2),
                              "", 0, 1, 0.01);
                    id += "-slider";
                    infectious_ids.push({id: id, cluster: cluster, state: state});
                }
            }

            // Initial Ratios
            elem.insertAdjacentHTML("beforeend",
                                    "<h4 class='epi-model-initial-ratios'>" +
                                    "Initial ratios</h4>");
            for (const state in states) {
                if (state !== "DEAD") {
                    let id = sim.ini_slider + c + "-" + state;
                    makeInput(elem, states[state].description, id,
                              states[state].initialRatio, "", 0, 1000, 1);
                    id += "-slider";
                    initialRatio_ids.push({id: id, cluster: cluster, state: state});
                }
            }

            elem.insertAdjacentHTML("beforeend",
                                    "<h4 class='epi-model-transitions'>" +
                                    "Transitions</h4>");
            setupTransitionTable(sim, cluster, elem);
            output = "</div>";
            elem.insertAdjacentHTML("beforeend", output);
        });
        const widgets = {
            "infectious_ids": infectious_ids,
            "initialRatio_ids": initialRatio_ids
        };
        return widgets;
    }

    function setupShowZeros(div_id, sim) {
        const id = 'epi-show-zeros-checkbox-' + div_id;
        let output = '';
        output += '<label for="' + id + '">Show zeros</label>';
        output +=
            '<input type="checkbox" id="' + id + '" ' +
            'name="epi-show-zeros-checkbox"';
        if (sim.show_zeros) {
            output += 'checked >';
        } else {
            output += '></div>';
        }
        ui_elements[div_id].showZeros.innerHTML = output;
        document.getElementById(id).addEventListener(
            "change", function (e) {
                if (e.target.checked)
                    sim.show_zeros = true;
                else
                    sim.show_zeros = false;
                let elems = ui_elements[div_id].parameterBox.
                    getElementsByClassName("epi-entry");
                for (let elem of elems) {
                    let slider = elem.getElementsByClassName("epi-slider")[0];
                    if (Number(slider.value) === 0) {
                        if (sim.show_zeros)
                            elem.classList.remove("epi-hidden")
                        else
                            elem.classList.add("epi-hidden");
                    }
                }
            });
    }

    function downloadFile(filename, text,
                          mime='data:application/csv;charset=utf-8,') {
        var e = document.createElement('a');
        e.setAttribute('href', mime + encodeURIComponent(text));
        e.setAttribute('download', filename);
        e.style.display = 'none';
        document.body.appendChild(e);
        e.click();
        document.body.removeChild(e);
    }

    function setupDownloadConfig(div_id, sim) {
        const id = 'epi-download-config-link-' + div_id;
        const output = '<a href="#"' +
              "title ='Configuration parameters of this " +
              "simulation in JSON format' " +  'id="' + id +
              '" class="epi-download-link">configuration</a>';

        ui_elements[div_id].downloadConfig.insertAdjacentHTML("afterbegin", output);
        document.getElementById(id).addEventListener(
            "click", function (e) {
                let text = EpiAgents.objToString(sim.config);
                downloadFile("epiconfig.json", text,
                             'data:text/javascript;charset=utf-8,');
            });
    }

    function setupDownloadResults(div_id, sim) {
        const id = 'epi-download-results-link-' + div_id;
        const output = '<a href="#"' + " title=" +
              "'Main output of the simulation on each iteration " +
              "in CSV format' " + 'id="' + id +
              '" class="epi-download-link">results</a>';

        ui_elements[div_id].downloadResults.innerHTML = output;
        document.getElementById(id).addEventListener(
            "click", function (e) {
                let text = "";
                for (let result of sim.results) {
                    for (let cell of result) {
                        text += cell + ",";
                    }
                    text += "\n";
                }
                downloadFile("epiresults.csv", text);
            });
    }

    function setupDownloadAgents(div_id, sim) {
        const id = 'epi-download-agents-link-' + div_id;
        const output = '<a href="#"' + " title=" +
              "'Agent state changes in CSV format' " + 'id="' + id +
              '" class="epi-download-link">agents</a>';

        ui_elements[div_id].downloadAgents.innerHTML = output;
        document.getElementById(id).addEventListener(
            "click", function (e) {
                let text = "agent,iteration,state\n";
                for (let agent of sim.agents) {
                    for (let state of agent.states) {
                        text += agent.id + "," + state[0] + "," + state[1] + "\n";
                    }
                }
                downloadFile("epiagents.csv", text);
            });
    }

    function getAllSiblings(elem) {
        let sibs = [];
        while (elem = elem.nextSibling) {
            sibs.push(elem);
        };
        return sibs;
    }

    function assignClusterEvents(div_id, sim, cluster, c) {
        document.getElementById(div_id + c + '-agents-slider').
            addEventListener("input", function(e) {
                let numAgents = e.target.value;
                if (numAgents > sim.agents.length) {
                    let from = sim.agents.length;
                    sim.generateAgents(numAgents - sim.agents.length, cluster);
                    sim.calcInitialRatios();
                    sim.calcInitialStates(from, numAgents);
                } else {
                    sim.removeAgents(sim.agents.length - numAgents);
                }
                eventDrawCanvas(sim);
                if (sim.state === EpiAgents.SimulationPhase.PLAYING) {
                    sim.pause();
                    sim.play();
                }
            });
        document.getElementById(div_id + c + '-area-slider').
            addEventListener("input", function(e) {
                let prop = parseFloat(e.target.value) / 100.0;
                for (let cluster of sim.clusters) {
                    cluster.right =
                        Math.min(cluster.left + prop * sim.config.width,
                                 sim.config.width);
                    cluster.bottom =
                        Math.min(cluster.top + prop * sim.config.height,
                                 sim.config.height);
                }
                for (let a of sim.agents) a.correctPosition();
                eventDrawCanvas(sim);
            });
    }

    function assignEvents(div_id, sim) {
        let play = ui_elements[div_id].play;
        let step = ui_elements[div_id].step;
        let reset = ui_elements[div_id].reset;
        play.addEventListener("click", function (e) {
            if (sim.state == EpiAgents.SimulationPhase.PAUSED) {
                e.target.textContent = "Pause";
                step.disabled = true;
                reset.disabled = true;
                sim.play();
            } else {
                e.target.textContent = "Run";
                step.disabled = false;
                reset.disabled = false;
                sim.pause();
            }
        });
        step.addEventListener("click", function (e) {
            if (sim.state == EpiAgents.SimulationPhase.PAUSED) {
                sim.step();
            }
        });
        reset.addEventListener("click", function (e) {
            let div = document.getElementById(div_id);
            div.innerHTML = "";
            let options = ui_elements[div_id].options;
            options.clusters = ui_elements[div_id].clusters;
            ui_elements[div_id] = undefined;
            let tempSim = create(div_id, options);
            for (let obj in tempSim) {
                sim[obj] = tempSim[obj];
            }
            init(sim, div_id);
        });


        let widgets = showParameters(sim, ui_elements[div_id].parameters);
        setupShowZeros(div_id, sim);
        setupDownloadConfig(div_id, sim);
        setupDownloadResults(div_id, sim);
        setupDownloadAgents(div_id, sim);

        sim.clusters.forEach(function(cluster, c) {
            assignClusterEvents(div_id, sim, cluster, c);
        });

        document.getElementById(div_id + '-speed-slider').
            addEventListener("input", function(e) {
                sim.config.interval = e.target.value;
                if (sim.state === EpiAgents.SimulationPhase.PLAYING) {
                    sim.pause();
                    sim.play();
                }
            });


        widgets["initialRatio_ids"].forEach(function(item) {
            document.getElementById(item.id).addEventListener(
                "input", function (e) {
                    item.cluster.states[item.state].initialRatio = e.target.value;
                });
        });
        widgets["infectious_ids"].forEach(function(item) {
            document.getElementById(item.id).addEventListener(
                "input", function (e) {
                    item.cluster.states[item.state].infectiousness = e.target.value;
                });
        });

        let elems = document.getElementById(div_id).
            getElementsByClassName("epi-min-max");
        for (let elem of elems) {
            elem.addEventListener("click", function() {
                if (elem.textContent === "x") {
                    elem.savedHeight = elem.parentElement.clientHeight;
                    elem.parentElement.style.height = "10px";
                    elem.textContent = "+";
                    for (let sib of getAllSiblings(elem)) {
                        sib.style.display = "none";
                    }
                } else {
                    elem.parentElement.style.height = elem.savedHeight + "px";
                    elem.textContent = "x";
                    for (let sib of getAllSiblings(elem)) {
                        sib.style.display = "inherit";
                    }
                }
            });
        }

        sim.canvas.addEventListener("click", function(e) {
            let rect = sim.canvas.getBoundingClientRect();
            let x = e.clientX - rect.left;
            let y = e.clientY - rect.top;
            let best = Number.MAX_VALUE;
            let id = -1;
            for (const agent of sim.agents) {
                let x_diff = (agent.x - x);
                let y_diff = (agent.y - y);
                let d = x_diff * x_diff + y_diff * y_diff;
                if (d < best) {
                    best = d;
                    id = agent.id;
                }
            }
            const agent = sim.agents[id];
            console.log("Agent: ", agent.id, agent);
            ui_elements[sim.div_id].simStatus.textContent = "Agent: " + id + ": [";
            agent.states.forEach(function(state, counter) {
                if (counter > 0 && counter < agent.states.length)
                    ui_elements[sim.div_id].simStatus.textContent += " ";
                ui_elements[sim.div_id].simStatus.textContent += "(" + state[0] +
                    " - " + sim.clusters[0].states[state[1]].description + ")";
            });
            ui_elements[sim.div_id].simStatus.textContent += "]";
        });

        ui_elements[sim.div_id].simStatus.addEventListener("click", function(e) {
            ui_elements[sim.div_id].simStatus.textContent = "";
        });
    }

    function init(sim, div_id) {
        correctDimensions(div_id, sim);
        createSimulationCanvas(div_id, sim);
        sim.initialize();
        eventDrawCanvas(sim);
        assignEvents(div_id, sim);
        writeResultsHeader(ui_elements[div_id].results, sim);
        writeResults(ui_elements[div_id].results, sim);
        EpiAgents.eventRecordResultHeader(sim);
        EpiAgents.eventRecordResult(sim);
        sim.chart = createGraph(ui_elements[div_id].chart, sim);
        ui_elements[div_id].clusters = EpiAgents.deepCopy(sim.clusters);
    }

    function create(div_id, options={}) {
        createUIElements(div_id);
        let chart = {};
        let override_options = options;
        override_options.extraBeforeEvents = options.extraBeforeEvents ||
            [eventDrawCanvas];
        // Full scope identifiers needed here for when configuration is
        // downloaded.
        override_options.extraDuringEvents = options.extraDuringEvents ||
            [
                eventDrawCanvas,
                function(sim)
                {
                    EpiAgentsUI.writeResults(EpiAgentsUI.ui_elements[sim.div_id].
                                             results, sim);
                    EpiAgentsUI.updateGraph(sim);
                }
            ];
        override_options.extraAfterEvents = options.extraAfterEvents ||
            [eventDrawCanvas];

        let sim = new EpiAgents.Simulation(options);
        sim.sim_div = ui_elements[div_id].sim_div;
        sim.canvas = null;
        sim.ctx = null;
        sim.div_id = div_id;
        sim.inf = INF + div_id;
        sim.ini = INI + div_id;
        sim.inf_slider = sim.inf + "-";
        sim.ini_slider = sim.ini + "-";
        sim.show_zeros = true;

        sim.chart_options = override_options.chart_options ||
            EpiAgentsUI.default_options.chart_options;

        sim.init = function() {
            init(sim, div_id);
        }
        ui_elements[div_id].options = EpiAgents.deepCopy(options);

        if (options.auto_play) {
            init(sim, div_id);
            sim.play();
        } else if (options.init) {
            init(sim, div_id);
        }
        EpiAgentsUI.ui_elements = ui_elements;
        return sim;
    }

    EpiAgentsUI.create = create;

} (window.EpiAgentsUI = window.EpiAgentsUI || {}));
