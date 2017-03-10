#!/usr/bin/env python
'''
A simple python based proxy for serving the viewer for the EPICS Archiver Appliance. 
The EPICS archiver appliance bundles a copy of this viewer; however, use this proxy as a starting point if you want a separate deployment of the viewer. 
'''

import SocketServer
import SimpleHTTPServer
import urllib
import argparse

port = 16000
retrievalURL = 'http://localhost:17668/retrieval'

class Proxy(SimpleHTTPServer.SimpleHTTPRequestHandler):
    def do_GET(self):
        print self.path
        if self.path.startswith('/retrieval/ui/viewer/'):
            filename = '/Users/mshankar/Documents/workspace/svg_viewer/' + self.path[len('/retrieval/ui/viewer/'):].split('?')[0]
            # print filename
            self.copyfile(open(filename, 'r'), self.wfile)
        else:
            proxiedurl = retrievalURL + self.path[len('/retrieval'):]
            # print proxiedurl
            self.copyfile(urllib.urlopen(proxiedurl), self.wfile)
            

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description='A python based proxy for serving the viewer for the EPICS Archiver Appliance')
    parser.add_argument('port', type=int, help='Port that the proxy listens on')
    parser.add_argument('retrievalURL', help='The data retrieval URL (data_retrieval_url) for the appliance; for example, http://archiver.lab.edu:17668/retrieval')
    args = parser.parse_args()
    
    port = args.port
    retrievalURL = args.retrievalURL
    
    httpd = SocketServer.ForkingTCPServer(('', port), Proxy)
    print "Listening on port", args.port, " and proxying", args.retrievalURL
    httpd.serve_forever()
