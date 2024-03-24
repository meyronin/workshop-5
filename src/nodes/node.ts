import express from "express"; 
import { BASE_NODE_PORT } from "../config";
import { NodeState, Value } from "../types";
import fetch from "node-fetch";
import { delay } from "../utils";

export async function node(
  nodeId: number,
  N: number,
  F: number,
  initialValue: Value,
  isFaulty: boolean,
  nodesAreReady: () => boolean,
  setNodeIsReady: (index: number) => void
) {
  const node = express();
  node.use(express.json());

  let currentState: NodeState = { killed: false, x: null, decided: null, k: null };
  let proposals = new Map<number, Value[]>();
  let votes = new Map<number, Value[]>();

  node.get("/status", (req, res) => res.status(isFaulty ? 500 : 200).send(isFaulty ? "faulty" : "live"));

  node.get("/getState", (req, res) => res.status(200).send(currentState));

  node.get("/stop", (req, res) => {
    currentState.killed = true;
    res.status(200).send("killed");
  });

  node.post("/message", async (req, res) => {
    let { k, x, messageType } = req.body;
    if (!isFaulty && !currentState.killed) {
      if (messageType == "propose") {
        if (!proposals.has(k)) {
          proposals.set(k, []);
        }
        proposals.get(k)!.push(x); 
        let proposal = proposals.get(k)!;

        if (proposal.length >= (N - F)) {
          let count0 = proposal.filter((el) => el == 0).length;
          let count1 = proposal.filter((el) => el == 1).length;
          if (count0 > (N / 2)) {
            x = 0;
          } else if (count1 > (N / 2)) {
            x = 1;
          } else {
            x = "?";
          }
          for (let i = 0; i < N; i++) {
            fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ k: k, x: x, messageType: "vote" }),
            });
          }
        }
      }
      else if (messageType == "vote") {
        if (!votes.has(k)) {
          votes.set(k, []);
        }
        votes.get(k)!.push(x)
        let vote = votes.get(k)!;
          if (vote.length >= (N - F)) {
            console.log("vote", vote,"node :",nodeId,"k :",k)
            let count0 = vote.filter((el) => el == 0).length;
            let count1 = vote.filter((el) => el == 1).length;

            if (count0 >= F + 1) {
              currentState.x = 0;
              currentState.decided = true;
            } else if (count1 >= F + 1) {
              currentState.x = 1;
              currentState.decided = true;
            } else {
              if (count0 + count1 > 0 && count0 > count1) {
                currentState.x = 0;
              } else if (count0 + count1 > 0 && count0 < count1) {
                currentState.x = 1;
              } else {
                currentState.x = Math.random() > 0.5 ? 0 : 1;
              }
              currentState.k = k + 1;

              for (let i = 0; i < N; i++) {
                fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                  },
                  body: JSON.stringify({k: currentState.k, x: currentState.x, messageType: "propose"}),
                });

            }
          }
        }
      }
    }
    res.status(200).send("The message is well received and processed.");
  });

  node.get("/start", async (req, res) => {
    while (!nodesAreReady()) await delay(5);
    if (!isFaulty) {
      currentState = { killed: false, x: initialValue, decided: false, k: 1 };
      for (let i = 0; i < N; i++) {
        fetch(`http://localhost:${BASE_NODE_PORT + i}/message`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ k: currentState.k, x: currentState.x, messageType: "propose" }),
        });
      }
    } else {
      currentState = { killed: false, x: null, decided: null, k: null };
    }
    res.status(200).send("The consensus algorithm has started.");
  });

  const server = node.listen(BASE_NODE_PORT + nodeId, () => {
    console.log(`Node ${nodeId} is listening on port ${BASE_NODE_PORT + nodeId}`);
    setNodeIsReady(nodeId);
  });

  return server;
}
