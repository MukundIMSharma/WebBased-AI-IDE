FROM node:20-alpine
RUN apk add --no-cache bash python3 py3-pip gcc g++ make git curl
RUN npm install -g typescript pyright typescript-language-server
WORKDIR /home/user
RUN mkdir -p workspace
CMD ["tail", "-f", "/dev/null"]
