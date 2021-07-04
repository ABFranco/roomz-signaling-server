# Roomz Signaling Server (RSS)

The Roomz Signaling Server (RSS), is a P2P video chat backend.

The backend consists of a Golang socket.io web server, responsible for handling
socket.io events we receive from the Roomz Frontend (RFE).

It currently acts as a simple relay of ICE candidate and session description
events.


## Future Work
We wish to adopt the RSS to a gRPC backend, instead of using socket.io. gRPC is
better for a potential larger Roomz microservice architecture. Socket.io was
chosen due to development speed.
