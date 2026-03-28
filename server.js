import express from "express";

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

app.post("/", (req, res) => {
    const directive = req.body.directive;

    // 🔍 DISCOVERY
    if (directive.header.namespace === "Alexa.Discovery") {
        return res.json({
            event: {
                header: {
                    namespace: "Alexa.Discovery",
                    name: "Discover.Response",
                    payloadVersion: "3",
                    messageId: directive.header.messageId
                },
                payload: {
                    endpoints: [
                        {
                            endpointId: "luz_sala",
                            manufacturerName: "Techrib",
                            friendlyName: "Luz da Sala",
                            description: "Luz teste",
                            displayCategories: ["LIGHT"],
                            capabilities: [
                                {
                                    type: "AlexaInterface",
                                    interface: "Alexa",
                                    version: "3"
                                },
                                {
                                    type: "AlexaInterface",
                                    interface: "Alexa.PowerController",
                                    version: "3",
                                    properties: {
                                        supported: [{ name: "powerState" }],
                                        retrievable: true
                                    }
                                }
                            ]
                        }
                    ]
                }
            }
        });
    }

    // 🔌 ON/OFF
    if (directive.header.namespace === "Alexa.PowerController") {
        const powerState =
            directive.header.name === "TurnOn" ? "ON" : "OFF";

        return res.json({
            context: {
                properties: [
                    {
                        namespace: "Alexa.PowerController",
                        name: "powerState",
                        value: powerState,
                        timeOfSample: new Date().toISOString(),
                        uncertaintyInMilliseconds: 500
                    }
                ]
            },
            event: {
                header: {
                    namespace: "Alexa",
                    name: "Response",
                    payloadVersion: "3",
                    messageId: directive.header.messageId
                },
                endpoint: directive.endpoint,
                payload: {}
            }
        });
    }

    res.json({});
});

app.listen(PORT, () => {
    console.log("Servidor rodando 🚀");
});